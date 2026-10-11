import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Role } from '@/shared/domain/roles';
import { parseJson, toJson } from '@/shared/infrastructure/json';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { Order, OrderItem, OrderPayment, OrderProps, TimelineEntry } from '../domain/order';
import type {
  ItemKind,
  OrderOrigin,
  OrderStatus,
  PaymentChannel,
  PaymentChoice,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from '../domain/order.types';
import { OrderRepository } from '../domain/ports';

export const orderInclude = {
  items: { orderBy: { position: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function toOrder(row: OrderRow): Order {
  const props: OrderProps = {
    code: row.code,
    origin: row.origin as OrderOrigin,
    status: row.status as OrderStatus,
    paymentChoice: row.paymentChoice as PaymentChoice | null,
    installments: row.installments,
    customerId: row.customerId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    barberId: row.barberId,
    anyBarber: row.anyBarber,
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    holdExpiresAt: row.holdExpiresAt,
    startedAt: row.startedAt,
    pausedAt: row.pausedAt,
    pausedSeconds: row.pausedSeconds,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
    completionCode: row.completionCode,
    createdById: row.createdById,
    discountCents: row.discountCents,
    paidAt: row.paidAt,
    fitInAt: row.fitInAt,
    createdAt: row.createdAt,
    items: row.items.map(
      (i): OrderItem => ({
        id: i.id,
        kind: i.kind as ItemKind,
        serviceId: i.serviceId,
        productId: i.productId,
        name: i.name,
        categoryId: i.categoryId,
        categoryName: i.categoryName,
        icon: i.icon,
        listPriceCents: i.listPriceCents,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
        discountCents: i.discountCents,
        durationMin: i.durationMin,
        addedById: i.addedById,
        addedByRole: i.addedByRole as Role,
        addedDuringService: i.addedDuringService,
        doneAt: i.doneAt,
        deliveredAt: i.deliveredAt,
        position: i.position,
        createdAt: i.createdAt,
      }),
    ),
    payments: row.payments.map(
      (p): OrderPayment => ({
        id: p.id,
        method: p.method as PaymentMethod,
        channel: p.channel as PaymentChannel,
        provider: p.provider as PaymentProvider,
        providerRef: p.providerRef,
        status: p.status as PaymentStatus,
        amountCents: p.amountCents,
        feeCents: p.feeCents,
        receivedCents: p.receivedCents,
        changeCents: p.changeCents,
        installments: p.installments,
        pixCode: p.pixCode,
        expiresAt: p.expiresAt,
        cardBrand: p.cardBrand,
        cardLast4: p.cardLast4,
        recordedById: p.recordedById,
        recordedByName: p.recordedByName,
        confirmedAt: p.confirmedAt,
        refundedAt: p.refundedAt,
        refundedCents: p.refundedCents,
        refundedById: p.refundedById,
        createdAt: p.createdAt,
      }),
    ),
    timeline: row.events.map(
      (e): TimelineEntry => ({
        id: e.id,
        type: e.type,
        description: e.description,
        meta: parseJson(e.meta, {}),
        actorId: e.actorId,
        actorName: e.actorName,
        createdAt: e.createdAt,
      }),
    ),
  };
  return Order.restore(row.id, props);
}

@Injectable()
export class PrismaOrderRepository extends OrderRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private async one(where: Prisma.OrderWhereInput): Promise<Order | null> {
    const row = await this.prisma.order.findFirst({ where, include: orderInclude });
    return row ? toOrder(row) : null;
  }

  findById(id: string) {
    return this.one({ id });
  }

  findByCode(code: string) {
    return this.one({ code });
  }

  findCartOf(customerId: string) {
    return this.one({ customerId, status: 'CART', origin: 'SITE' });
  }

  findByPaymentRef(providerRef: string) {
    return this.one({ payments: { some: { providerRef } } });
  }

  async codeExists(code: string): Promise<boolean> {
    return (await this.prisma.order.count({ where: { code } })) > 0;
  }

  async nextWalkInSequence(): Promise<number> {
    // Próximo número depois do maior AVL-#### já usado.
    const codes = await this.prisma.order.findMany({ where: { code: { startsWith: 'AVL-' } }, select: { code: true } });
    const max = codes.reduce((m, c) => Math.max(m, Number(c.code.slice(4)) || 0), 0);
    return max + 1;
  }

  async findExpiredHolds(now: Date): Promise<Order[]> {
    const rows = await this.prisma.order.findMany({
      where: { status: 'PENDING_PAYMENT', holdExpiresAt: { lte: now } },
      include: orderInclude,
    });
    return rows.map(toOrder);
  }

  async findLateScheduled(now: Date): Promise<Order[]> {
    const rows = await this.prisma.order.findMany({
      where: { status: 'SCHEDULED', type: 'APPOINTMENT', origin: 'SITE', scheduledStart: { lt: now } },
      include: orderInclude,
    });
    return rows.map(toOrder);
  }

  async save(order: Order): Promise<void> {
    const s = order.snapshot;
    const data = {
      code: s.code,
      origin: s.origin,
      type: order.type,
      status: s.status,
      paymentChoice: s.paymentChoice,
      installments: s.installments,
      customerId: s.customerId,
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      barberId: s.barberId,
      anyBarber: s.anyBarber,
      scheduledStart: s.scheduledStart,
      scheduledEnd: s.scheduledEnd,
      holdExpiresAt: s.holdExpiresAt,
      startedAt: s.startedAt,
      pausedAt: s.pausedAt,
      pausedSeconds: s.pausedSeconds,
      completedAt: s.completedAt,
      cancelledAt: s.cancelledAt,
      cancelReason: s.cancelReason,
      completionCode: s.completionCode,
      createdById: s.createdById,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      totalCents: order.totalCents,
      paidCents: order.paidCents,
      refundedCents: order.refundedCents,
      paidAt: s.paidAt,
      fitInAt: s.fitInAt,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.order.upsert({ where: { id: order.id }, create: { id: order.id, createdAt: s.createdAt, ...data }, update: data });

      const itemIds = s.items.map((i) => i.id);
      await tx.orderItem.deleteMany({ where: { orderId: order.id, id: { notIn: itemIds } } });
      for (const [position, i] of s.items.entries()) {
        const item = {
          kind: i.kind,
          serviceId: i.serviceId,
          productId: i.productId,
          name: i.name,
          categoryId: i.categoryId,
          categoryName: i.categoryName,
          icon: i.icon,
          listPriceCents: i.listPriceCents,
          unitPriceCents: i.unitPriceCents,
          quantity: i.quantity,
          discountCents: i.discountCents,
          durationMin: i.durationMin,
          addedById: i.addedById,
          addedByRole: i.addedByRole,
          addedDuringService: i.addedDuringService,
          doneAt: i.doneAt,
          deliveredAt: i.deliveredAt,
          position,
        };
        await tx.orderItem.upsert({
          where: { id: i.id },
          create: { id: i.id, orderId: order.id, createdAt: i.createdAt, ...item },
          update: item,
        });
      }

      for (const p of s.payments) {
        const payment = {
          method: p.method,
          channel: p.channel,
          provider: p.provider,
          providerRef: p.providerRef,
          status: p.status,
          amountCents: p.amountCents,
          feeCents: p.feeCents,
          receivedCents: p.receivedCents,
          changeCents: p.changeCents,
          installments: p.installments,
          pixCode: p.pixCode,
          expiresAt: p.expiresAt,
          cardBrand: p.cardBrand,
          cardLast4: p.cardLast4,
          recordedById: p.recordedById,
          recordedByName: p.recordedByName,
          confirmedAt: p.confirmedAt,
          refundedAt: p.refundedAt,
          refundedCents: p.refundedCents,
          refundedById: p.refundedById,
        };
        await tx.payment.upsert({
          where: { id: p.id },
          create: { id: p.id, orderId: order.id, createdAt: p.createdAt, ...payment },
          update: payment,
        });
      }

      const fresh = s.timeline.filter((e) => e.isNew);
      if (fresh.length) {
        await tx.orderEvent.createMany({
          data: fresh.map((e) => ({
            id: e.id,
            orderId: order.id,
            type: e.type,
            description: e.description,
            meta: toJson(e.meta),
            actorId: e.actorId,
            actorName: e.actorName,
            createdAt: e.createdAt,
          })),
        });
        for (const e of fresh) e.isNew = false;
      }
    });
  }
}
