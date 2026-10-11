import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppConfig } from '@/config/app-config.service';
import { avatarFor, AvatarView, fullName } from '@/shared/domain/avatar';
import { Clock } from '@/shared/infrastructure/clock';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { SettingsService } from '@/modules/business/application/settings.service';
import { Order } from '../domain/order';
import { DisplayStatus, PAYMENT_METHOD_LABEL, PaymentChoice } from '../domain/order.types';
import { orderInclude, toOrder } from '../infrastructure/prisma-order.repository';

export const orderViewInclude = {
  ...orderInclude,
  barber: { include: { staffProfile: true } },
  customer: true,
  review: { select: { id: true } },
  productReviews: { select: { productId: true } },
} satisfies Prisma.OrderInclude;

export type OrderViewRow = Prisma.OrderGetPayload<{ include: typeof orderViewInclude }>;

export type Audience = 'customer' | 'staff' | 'admin';

const CHOICE_LABEL: Record<PaymentChoice, string> = {
  PIX: 'Pix',
  CREDIT: 'Cartão de crédito',
  DEBIT: 'Cartão de débito',
  CASH: 'Dinheiro, no balcão',
};

export const DISPLAY_LABEL: Record<DisplayStatus, string> = {
  CART: 'No carrinho',
  PROCESSING: 'Processando pagamento',
  AWAITING_PAYMENT: 'Aguardando pagamento',
  PAID: 'Pago',
  LATE: 'Atrasada',
  READY_FOR_PICKUP: 'Pago · retirar',
  IN_SERVICE: 'Em atendimento',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  NO_SHOW: 'Falta',
};

export interface PersonRef {
  id: string;
  name: string;
  firstName: string;
  avatar: AvatarView;
}

/**
 * Monta a visão de um pedido para cada público. O código de conclusão, por
 * exemplo, só aparece para o cliente (durante o atendimento) e para o admin.
 */
@Injectable()
export class OrderViews {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async load(where: Prisma.OrderWhereUniqueInput): Promise<OrderViewRow | null> {
    return this.prisma.order.findUnique({ where, include: orderViewInclude });
  }

  async build(row: OrderViewRow, audience: Audience) {
    const now = this.clock.now();
    const order = toOrder(row);
    const s = order.snapshot;
    const scheduling = await this.settings.get('scheduling');
    const policy = { refundCutoffMin: scheduling.refundCutoffMin };
    const display = order.displayStatus(now);
    const pendingPayment = s.payments.filter((p) => p.status === 'PENDING' && p.channel === 'ONLINE').at(-1);

    let late: { minutes: number; fitInAt: string | null; position: number } | null = null;
    if (order.isLate(now) && s.barberId) {
      const others = await this.prisma.order.count({
        where: {
          barberId: s.barberId,
          status: 'SCHEDULED',
          origin: 'SITE',
          scheduledStart: { lt: s.scheduledStart!, gte: new Date(now.getTime() - 6 * 3600_000) },
        },
      });
      late = { minutes: order.minutesLate(now), fitInAt: s.fitInAt?.toISOString() ?? null, position: others + 1 };
    }

    const person = (u: { id: string; firstName: string; lastName: string; avatarUrl: string | null } | null): PersonRef | null =>
      u ? { id: u.id, name: fullName(u), firstName: u.firstName, avatar: avatarFor(u) } : null;

    const showCompletion =
      (audience === 'customer' && s.status === 'IN_SERVICE') || audience === 'admin';

    return {
      id: order.id,
      code: s.code,
      origin: s.origin,
      type: order.type,
      status: s.status,
      displayStatus: display,
      displayLabel: DISPLAY_LABEL[display],
      paymentChoice: s.paymentChoice,
      paymentChoiceLabel: s.paymentChoice ? CHOICE_LABEL[s.paymentChoice] : null,
      installments: s.installments,
      customer: {
        ...(person(row.customer) ?? { id: '', name: s.customerName, firstName: s.customerName.split(' ')[0] ?? '', avatar: avatarFor({ id: order.id, name: s.customerName }) }),
        name: row.customer ? fullName(row.customer) : s.customerName,
        email: audience === 'customer' ? row.customer?.email ?? null : audience === 'admin' ? row.customer?.email ?? null : null,
        phone: audience === 'customer' ? null : s.customerPhone ?? row.customer?.phone ?? null,
      },
      barber: row.barber ? { ...person(row.barber)!, headline: row.barber.staffProfile?.headline ?? '', chair: row.barber.staffProfile?.chairLabel ?? null } : null,
      anyBarber: s.anyBarber,
      scheduledStart: s.scheduledStart?.toISOString() ?? null,
      scheduledEnd: s.scheduledEnd?.toISOString() ?? null,
      durationMin: order.durationMin,
      startedAt: s.startedAt?.toISOString() ?? null,
      completedAt: s.completedAt?.toISOString() ?? null,
      cancelledAt: s.cancelledAt?.toISOString() ?? null,
      cancelReason: s.cancelReason,
      createdAt: s.createdAt.toISOString(),
      paidAt: s.paidAt?.toISOString() ?? null,
      holdExpiresAt: s.holdExpiresAt?.toISOString() ?? null,
      elapsedSeconds: order.elapsedSeconds(now),
      paused: !!s.pausedAt,
      items: s.items.map((i) => ({
        id: i.id,
        kind: i.kind,
        serviceId: i.serviceId,
        productId: i.productId,
        name: i.name,
        icon: i.icon,
        categoryName: i.categoryName,
        listPriceCents: i.listPriceCents,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
        discountCents: i.discountCents,
        totalCents: i.unitPriceCents * i.quantity - i.discountCents,
        durationMin: i.durationMin,
        addedByRole: i.addedByRole,
        addedDuringService: i.addedDuringService,
        doneAt: i.doneAt?.toISOString() ?? null,
        deliveredAt: i.deliveredAt?.toISOString() ?? null,
      })),
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      totalCents: order.totalCents,
      paidCents: order.paidCents,
      onlinePaidCents: order.onlinePaidCents,
      refundedCents: order.refundedCents,
      amountDueCents: order.amountDueCents,
      payments: s.payments
        .filter((p) => p.status !== 'CANCELLED' && (audience !== 'customer' || p.status !== 'FAILED'))
        .map((p) => ({
          id: p.id,
          method: p.method,
          methodLabel: PAYMENT_METHOD_LABEL[p.method],
          channel: p.channel,
          provider: p.provider,
          providerRef: audience === 'admin' ? p.providerRef : null,
          status: p.status,
          amountCents: p.amountCents,
          feeCents: audience === 'customer' ? 0 : p.feeCents,
          installments: p.installments,
          receivedCents: p.receivedCents,
          changeCents: p.changeCents,
          cardBrand: p.cardBrand,
          cardLast4: p.cardLast4,
          recordedByName: p.recordedByName,
          confirmedAt: p.confirmedAt?.toISOString() ?? null,
          refundedCents: p.refundedCents,
          refundedAt: p.refundedAt?.toISOString() ?? null,
        })),
      pendingPayment: pendingPayment
        ? { id: pendingPayment.id, method: pendingPayment.method, pixCode: pendingPayment.pixCode, expiresAt: pendingPayment.expiresAt?.toISOString() ?? null }
        : null,
      timeline: s.timeline.map((e) => ({
        type: e.type,
        description: e.description,
        actorName: audience === 'customer' ? null : e.actorName,
        createdAt: e.createdAt.toISOString(),
      })),
      late,
      cancel: {
        allowed: audience === 'customer' ? order.canCustomerCancel(now, policy) : false,
        deadline: order.refundDeadline(policy)?.toISOString() ?? null,
      },
      completionCode: showCompletion ? s.completionCode : null,
      review: row.review ? { id: row.review.id } : null,
      canReview:
        audience === 'customer' &&
        s.status === 'COMPLETED' &&
        !!row.customerId &&
        ((order.type === 'APPOINTMENT' && !row.review) ||
          order.productItems.some((i) => !row.productReviews.some((p) => p.productId === i.productId))),
      productsPending: order.productItems.filter((i) => !i.deliveredAt).length,
    };
  }

  async byCode(code: string, audience: Audience) {
    const row = await this.load({ code });
    return row ? this.build(row, audience) : null;
  }

  async byId(id: string, audience: Audience) {
    const row = await this.load({ id });
    return row ? this.build(row, audience) : null;
  }

  async many(rows: OrderViewRow[], audience: Audience) {
    return Promise.all(rows.map((r) => this.build(r, audience)));
  }

  /** Para quem só precisa do agregado (sem montar a visão inteira). */
  aggregate(row: OrderViewRow): Order {
    return toOrder(row);
  }
}

export type OrderView = Awaited<ReturnType<OrderViews['build']>>;
