import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppConfig } from '@/config/app-config.service';
import { avatarFor, fullName } from '@/shared/domain/avatar';
import { addDays, DateKey, dayRange, formatHm, minutesOfDay, parseHm, toDateKey, weekdayOf } from '@/shared/domain/business-time';
import { DomainError, invariant } from '@/shared/domain/domain-error';
import { Money } from '@/shared/domain/money';
import { makePeriod } from '@/shared/domain/period';
import type { Actor } from '@/shared/presentation/auth';
import { Clock } from '@/shared/infrastructure/clock';
import { EventBus } from '@/shared/infrastructure/event-bus';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { SettingsService } from '@/modules/business/application/settings.service';
import { AvailabilityService } from '@/modules/scheduling/application/availability.service';
import { OrderEventOf } from '../domain/order';
import { OrderRepository, PaymentGateway } from '../domain/ports';
import { actorRef } from './actor';
import { DISPLAY_LABEL, OrderView, orderViewInclude, OrderViews } from './order-views';

export const adminOrdersQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['ALL', 'CART', 'AWAITING_PAYMENT', 'PAID', 'COMPLETED', 'CANCELLED']).default('ALL'),
  barberId: z.string().optional(),
  serviceId: z.string().optional(),
  method: z.enum(['PIX', 'CREDIT', 'DEBIT', 'CASH', 'COUNTER']).optional(),
  origin: z.enum(['SITE', 'WALK_IN']).optional(),
  type: z.enum(['APPOINTMENT', 'PICKUP']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});
export type AdminOrdersQuery = z.infer<typeof adminOrdersQuery>;

const CHIP_OF: Record<string, 'CART' | 'AWAITING_PAYMENT' | 'PAID' | 'COMPLETED' | 'CANCELLED'> = {
  CART: 'CART',
  PROCESSING: 'AWAITING_PAYMENT',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  PAID: 'PAID',
  LATE: 'PAID',
  READY_FOR_PICKUP: 'PAID',
  IN_SERVICE: 'PAID',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'COMPLETED',
};

/** Pedidos no painel: lista com filtros, detalhe financeiro, estorno e agenda da casa. */
@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: OrderViews,
    private readonly orders: OrderRepository,
    private readonly gateway: PaymentGateway,
    private readonly settings: SettingsService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly config: AppConfig,
    private readonly availability: AvailabilityService,
  ) {}

  private get tz() {
    return this.config.timeZone;
  }

  private async filtered(q: AdminOrdersQuery): Promise<{ views: OrderView[]; period: { from: DateKey; to: DateKey } }> {
    const today = toDateKey(this.clock.now(), this.tz);
    const from = q.from ?? addDays(today, -6);
    const to = q.to ?? addDays(today, 30);
    const p = makePeriod(from, to, this.tz);
    const where: Prisma.OrderWhereInput = {
      AND: [
        {
          OR: [
            { scheduledStart: { gte: p.start, lt: p.end } },
            { scheduledStart: null, createdAt: { gte: p.start, lt: p.end } },
          ],
        },
        q.barberId ? { barberId: q.barberId } : {},
        q.serviceId ? { items: { some: { serviceId: q.serviceId } } } : {},
        q.origin ? { origin: q.origin } : {},
        q.type ? { type: q.type } : {},
        q.method === 'COUNTER'
          ? { payments: { some: { channel: 'COUNTER', status: 'SUCCEEDED' } } }
          : q.method
            ? { paymentChoice: q.method }
            : {},
        q.q
          ? { OR: [{ code: this.prisma.contains(q.q.toUpperCase()) }, { customerName: this.prisma.contains(q.q) }] }
          : {},
      ],
    };
    const rows = await this.prisma.order.findMany({ where, include: orderViewInclude, orderBy: [{ scheduledStart: 'desc' }, { createdAt: 'desc' }] });
    return { views: await this.views.many(rows, 'admin'), period: { from, to } };
  }

  async list(q: AdminOrdersQuery) {
    const { views, period } = await this.filtered(q);
    const counts = { ALL: views.length, CART: 0, AWAITING_PAYMENT: 0, PAID: 0, COMPLETED: 0, CANCELLED: 0 };
    for (const v of views) counts[CHIP_OF[v.displayStatus]!]++;
    const matching = q.status === 'ALL' ? views : views.filter((v) => CHIP_OF[v.displayStatus] === q.status);
    const totalCents = matching.filter((v) => v.status !== 'CART' && v.status !== 'CANCELLED').reduce((s, v) => s + v.totalCents, 0);
    const start = (q.page - 1) * q.pageSize;
    return {
      period,
      counts,
      total: matching.length,
      totalCents,
      page: q.page,
      pageSize: q.pageSize,
      items: matching.slice(start, start + q.pageSize).map((v) => this.row(v)),
    };
  }

  private row(v: OrderView) {
    return {
      id: v.id,
      code: v.code,
      origin: v.origin,
      type: v.type,
      customerName: v.customer.name + (v.origin === 'WALK_IN' ? ' · avulso' : ''),
      itemsLabel: v.items.map((i) => i.name).join(' + ') + (v.type === 'PICKUP' ? ' · retirada' : ''),
      barberName: v.barber?.name ?? '—',
      scheduledStart: v.scheduledStart,
      paymentLabel: v.payments.find((p) => p.status === 'SUCCEEDED')
        ? v.payments.filter((p) => p.status === 'SUCCEEDED').map((p) => p.methodLabel + (p.installments > 1 ? ` ${p.installments}x` : '')).join(' + ')
        : v.paymentChoiceLabel?.replace(', no balcão', '') ?? '—',
      displayStatus: v.displayStatus,
      displayLabel: v.displayLabel,
      totalCents: v.totalCents,
      amountDueCents: v.amountDueCents,
    };
  }

  async exportCsv(q: AdminOrdersQuery): Promise<string> {
    const { views } = await this.filtered({ ...q, page: 1, pageSize: 100 });
    const matching = q.status === 'ALL' ? views : views.filter((v) => CHIP_OF[v.displayStatus] === q.status);
    const header = ['Código', 'Cliente', 'Itens', 'Profissional', 'Horário', 'Pagamento', 'Status', 'Valor', 'A receber'];
    const esc = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = matching.map((v) => {
      const r = this.row(v);
      const when = r.scheduledStart ? `${toDateKey(new Date(r.scheduledStart), this.tz)} ${formatHm(minutesOfDay(new Date(r.scheduledStart), this.tz))}` : '';
      return [r.code, r.customerName, r.itemsLabel, r.barberName, when, r.paymentLabel, DISPLAY_LABEL[r.displayStatus], (r.totalCents / 100).toFixed(2).replace('.', ','), (r.amountDueCents / 100).toFixed(2).replace('.', ',')]
        .map(esc)
        .join(';');
    });
    return '﻿' + [header.map(esc).join(';'), ...lines].join('\n');
  }

  async detail(code: string) {
    const row = await this.views.load({ code: code.toUpperCase() });
    if (!row) throw DomainError.notFound('Pedido');
    const view = await this.views.build(row, 'admin');
    const [lines, customerStats, payment] = await Promise.all([
      this.prisma.commissionLine.findMany({ where: { orderId: row.id }, include: { barber: true } }),
      row.customerId
        ? Promise.all([
            this.prisma.order.count({ where: { customerId: row.customerId, status: { notIn: ['CART'] } } }),
            this.prisma.order.count({ where: { customerId: row.customerId, OR: [{ status: 'NO_SHOW' }, { events: { some: { type: 'started', meta: { contains: '"late":true' } } } }] } }),
          ])
        : Promise.resolve(null),
      this.settings.get('payment'),
    ]);
    const fees = view.payments.reduce((s, p) => s + p.feeCents, 0);
    const commissions = lines.reduce((s, l) => s + l.amountCents, 0);
    const received = view.paidCents - view.refundedCents;
    const now = this.clock.now();
    const deadline = view.cancel.deadline ? new Date(view.cancel.deadline) : null;
    return {
      ...view,
      finance: {
        feesCents: fees,
        commissionCents: commissions,
        netCents: received - fees - commissions,
        commissionLines: lines.map((l) => ({
          barberName: fullName(l.barber),
          kind: l.kind,
          rateBps: l.rateBps,
          baseCents: l.baseCents,
          amountCents: l.amountCents,
          label: `${l.kind === 'SERVICE' ? 'Comissão' : 'Comissão de produto'} ${fullName(l.barber)} (${Money.formatRate(l.rateBps)})`,
        })),
      },
      customerStats: customerStats
        ? { since: row.customer?.createdAt.toISOString() ?? null, orders: customerStats[0], lateCount: customerStats[1] }
        : null,
      refund: {
        allowed: ['PENDING_PAYMENT', 'SCHEDULED', 'NO_SHOW'].includes(view.status) && view.onlinePaidCents - view.refundedCents > 0,
        outsideWindow: !!deadline && now > deadline,
        manualAllowed: payment.manualRefundOutsideWindow,
        amountCents: view.onlinePaidCents - view.refundedCents,
      },
    };
  }

  async refund(actor: Actor, code: string) {
    const order = await this.orders.findByCode(code.toUpperCase());
    if (!order) throw DomainError.notFound('Pedido');
    const [payment, scheduling] = await Promise.all([this.settings.get('payment'), this.settings.get('scheduling')]);
    const now = this.clock.now();
    const deadline = order.refundDeadline({ refundCutoffMin: scheduling.refundCutoffMin });
    const outside = !!deadline && now > deadline;
    invariant(!outside || payment.manualRefundOutsideWindow, 'manual_refund_disabled', 'O estorno fora do prazo está desligado nas configurações de pagamento.');
    invariant(!outside || actor.roles.includes('ADMIN'), 'admin_only', 'O estorno fora do prazo exige um administrador.');

    const refunds = order.refundByStaff({ now, actor: actorRef(actor, ['ADMIN', 'RECEPTIONIST']), reason: outside ? `Estorno manual fora do prazo · autorizado por ${actor.name}` : `Estornado por ${actor.name}` });
    for (const r of refunds) {
      if (!r.payment.providerRef) continue;
      const result = await this.gateway.refund(r.payment.providerRef, r.amountCents);
      if (result.succeeded) order.markRefunded(r.payment.id, r.amountCents, actor.id, now);
    }
    await this.orders.save(order);
    await this.events.publishFrom(order);
    return this.detail(code);
  }

  async resendReceipt(actor: Actor, code: string) {
    const order = await this.orders.findByCode(code.toUpperCase());
    if (!order) throw DomainError.notFound('Pedido');
    order.note('receipt_resent', `Comprovante reenviado por ${actor.name}`, actorRef(actor, ['ADMIN', 'RECEPTIONIST']), this.clock.now());
    await this.orders.save(order);
    await this.events.publish([new OrderEventOf('order.receipt_requested', order.id)]);
    return { ok: true };
  }

  /** Agenda da casa: uma coluna por profissional, blocos de atendimento por horário. */
  async agenda(date?: DateKey, barberId?: string) {
    const day = date ?? toDateKey(this.clock.now(), this.tz);
    const { start, end } = dayRange(day, this.tz);
    const now = this.clock.now();
    const [barbers, rows, hours] = await Promise.all([
      this.prisma.user.findMany({
        where: { active: true, roles: { contains: 'BARBER' }, id: barberId || undefined },
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.order.findMany({
        where: {
          type: 'APPOINTMENT',
          barberId: barberId || undefined,
          status: { in: ['SCHEDULED', 'IN_SERVICE', 'COMPLETED', 'PENDING_PAYMENT', 'NO_SHOW'] },
          OR: [{ scheduledStart: { gte: start, lt: end } }, { fitInAt: { gte: start, lt: end } }],
        },
        include: orderViewInclude,
        orderBy: { scheduledStart: 'asc' },
      }),
      this.settings.get('hours'),
    ]);
    const views = await this.views.many(rows, 'admin');
    const h = hours.weekly.find((w) => w.weekday === weekdayOf(day));
    const windows = await this.availability.windowsOn(day, barbers.map((b) => b.id));
    return {
      date: day,
      open: h?.open ?? null,
      close: h?.close ?? null,
      breakStart: h?.breakStart ?? null,
      breakEnd: h?.breakEnd ?? null,
      nowMinutes: toDateKey(now, this.tz) === day ? minutesOfDay(now, this.tz) : null,
      barbers: barbers.map((b) => ({
        id: b.id,
        name: fullName(b),
        firstName: b.firstName,
        avatar: avatarFor(b),
        // Turnos em que o profissional atende no dia; fora deles a coluna aparece fechada.
        windows: windows.get(b.id) ?? [],
        events: views
          .filter((v) => v.barber?.id === b.id)
          .map((v) => {
            // Quem já foi atendido aparece no horário real; o resto, no previsto.
            const s = new Date(v.startedAt ?? v.scheduledStart!);
            const e = new Date(v.completedAt ?? (v.startedAt ? Math.max(now.getTime(), new Date(v.scheduledEnd!).getTime()) : v.scheduledEnd!));
            return {
              orderId: v.id,
              code: v.code,
              customerName: v.customer.name,
              itemsLabel: v.items.filter((i) => i.kind === 'SERVICE').map((i) => i.name).join(' + '),
              startMin: minutesOfDay(s, this.tz),
              endMin: Math.max(minutesOfDay(e, this.tz), minutesOfDay(s, this.tz) + 15),
              start: formatHm(minutesOfDay(s, this.tz)),
              end: formatHm(minutesOfDay(e, this.tz)),
              state:
                v.status === 'IN_SERVICE' ? 'now' : v.displayStatus === 'LATE' ? 'late' : v.status === 'COMPLETED' ? 'done' : v.status === 'NO_SHOW' ? 'no_show' : v.status === 'PENDING_PAYMENT' ? 'pending' : 'scheduled',
              lateMinutes: v.late?.minutes ?? null,
              fitInAt: v.late?.fitInAt ? formatHm(minutesOfDay(new Date(v.late.fitInAt), this.tz)) : null,
              fitInMin: v.late?.fitInAt ? minutesOfDay(new Date(v.late.fitInAt), this.tz) : null,
              origin: v.origin,
              displayLabel: v.displayLabel,
              // Detalhes do cartão que aparece ao passar o mouse.
              customerPhone: v.customer.phone,
              scheduled: v.scheduledStart ? `${formatHm(minutesOfDay(new Date(v.scheduledStart), this.tz))}–${formatHm(minutesOfDay(new Date(v.scheduledEnd!), this.tz))}` : null,
              durationMin: v.durationMin,
              services: v.items.filter((i) => i.kind === 'SERVICE').map((i) => ({ name: i.name, done: !!i.doneAt })),
              products: v.items.filter((i) => i.kind === 'PRODUCT').map((i) => (i.quantity > 1 ? `${i.name} × ${i.quantity}` : i.name)),
              totalCents: v.totalCents,
              paidCents: v.paidCents,
              amountDueCents: v.amountDueCents,
              paymentChoiceLabel: v.paymentChoiceLabel,
            };
          }),
      })),
      openMin: h?.open ? parseHm(h.open) : null,
      closeMin: h?.close ? parseHm(h.close) : null,
    };
  }
}
