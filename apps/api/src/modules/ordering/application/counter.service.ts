import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppConfig } from '@/config/app-config.service';
import { dayRange, toDateKey } from '@/shared/domain/business-time';
import { DomainError } from '@/shared/domain/domain-error';
import type { Actor } from '@/shared/presentation/auth';
import { Clock } from '@/shared/infrastructure/clock';
import { EventBus } from '@/shared/infrastructure/event-bus';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { AvailabilityService } from '@/modules/scheduling/application/availability.service';
import { normalizeCode } from '../domain/codes';
import { COUNTER_METHODS, PaymentMethod } from '../domain/order.types';
import { OrderRepository } from '../domain/ports';
import { actorRef } from './actor';
import { orderViewInclude, OrderViews } from './order-views';

export const counterPaymentInput = z.object({
  method: z.enum(COUNTER_METHODS as [PaymentMethod, ...PaymentMethod[]]),
  receivedCents: z.number().int().positive().optional(),
  deliverProducts: z.boolean().default(false),
});

export const deliverInput = z.object({ itemIds: z.array(z.string()).optional(), code: z.string().optional() });

/**
 * Balcão: o que receber (dinheiro, saldo de extras, avulsos), produtos para
 * entregar e baixa de pagamento. A baixa fica registrada com o nome de quem fez.
 */
@Injectable()
export class CounterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderRepository,
    private readonly views: OrderViews,
    private readonly availability: AvailabilityService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async today(search?: string) {
    const tz = this.config.timeZone;
    const today = toDateKey(this.clock.now(), tz);
    const { start, end } = dayRange(today, tz);
    const q = search?.trim();
    const textFilter = q
      ? { OR: [{ code: this.prisma.contains(q.toUpperCase()) }, { customerName: this.prisma.contains(q) }] }
      : {};

    // Tudo que pode ter valor a receber: hoje e pendências de dias anteriores.
    const candidates = await this.prisma.order.findMany({
      where: {
        AND: [textFilter],
        status: { in: ['SCHEDULED', 'IN_SERVICE', 'COMPLETED'] },
        OR: [
          { scheduledStart: { gte: start, lt: end } },
          { completedAt: { gte: start, lt: end } },
          { createdAt: { gte: start, lt: end } },
          // Retirada comprada em outro dia e ainda não entregue.
          { type: 'PICKUP', status: 'SCHEDULED' },
          // Avulso que fechou sem pagamento em dia anterior.
          { origin: 'WALK_IN', status: 'COMPLETED', paidAt: null },
        ],
      },
      include: orderViewInclude,
      orderBy: { scheduledStart: 'asc' },
    });
    const views = await this.views.many(candidates, 'staff');
    const toReceive = views
      .filter((o) => o.amountDueCents > 0)
      .map((o) => ({
        ...o,
        reason:
          o.origin === 'WALK_IN'
            ? 'Pedido avulso'
            : o.paymentChoice === 'CASH'
              ? 'Agendado em dinheiro'
              : `Saldo · ${o.items.filter((i) => i.addedDuringService).map((i) => i.name).join(', ') || 'extras'}`,
      }));
    const toDeliver = views.filter((o) => o.items.some((i) => i.kind === 'PRODUCT' && !i.deliveredAt));

    const [paidToday, ordersToday, walkIns] = await Promise.all([
      this.prisma.payment.findMany({ where: { status: { in: ['SUCCEEDED', 'REFUNDED'] }, confirmedAt: { gte: start, lt: end } } }),
      this.prisma.order.count({ where: { status: { notIn: ['CART', 'CANCELLED'] }, OR: [{ scheduledStart: { gte: start, lt: end } }, { createdAt: { gte: start, lt: end }, type: 'PICKUP' }] } }),
      this.prisma.order.count({ where: { origin: 'WALK_IN', createdAt: { gte: start, lt: end } } }),
    ]);
    const counterPaid = paidToday.filter((p) => p.channel === 'COUNTER');

    return {
      kpis: {
        toReceiveCents: toReceive.reduce((s, o) => s + o.amountDueCents, 0),
        toReceiveCount: toReceive.length,
        receivedTodayCents: counterPaid.reduce((s, p) => s + p.amountCents, 0),
        receivedCashCents: counterPaid.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amountCents, 0),
        toDeliverCount: toDeliver.reduce((s, o) => s + o.items.filter((i) => i.kind === 'PRODUCT' && !i.deliveredAt).length, 0),
        pickupCount: toDeliver.filter((o) => o.type === 'PICKUP').length,
        ordersToday,
        walkInsToday: walkIns,
      },
      toReceive,
      toDeliver,
      cash: {
        byMethod: Object.fromEntries(
          COUNTER_METHODS.map((m) => [m, counterPaid.filter((p) => p.method === m).reduce((s, p) => s + p.amountCents, 0)]),
        ),
        online: paidToday.filter((p) => p.channel === 'ONLINE').reduce((s, p) => s + p.amountCents, 0),
      },
    };
  }

  async order(code: string) {
    const view = await this.views.byCode(normalizeCode(code), 'staff');
    if (!view) throw DomainError.notFound('Pedido');
    return view;
  }

  async recordPayment(actor: Actor, orderId: string, input: z.infer<typeof counterPaymentInput>) {
    const order = await this.orders.findById(orderId);
    if (!order) throw DomainError.notFound('Pedido');
    const ref = actorRef(actor, ['RECEPTIONIST', 'ADMIN', 'BARBER']);
    const now = this.clock.now();
    order.recordCounterPayment({ method: input.method, receivedCents: input.receivedCents, actor: ref, now });
    if (input.deliverProducts && order.productItems.some((i) => !i.deliveredAt)) order.deliverProducts({ actor: ref, now });
    await this.orders.save(order);
    await this.events.publishFrom(order);
    return this.views.byId(orderId, 'staff');
  }

  async deliver(actor: Actor, orderId: string, input: z.infer<typeof deliverInput>) {
    const order = await this.orders.findById(orderId);
    if (!order) throw DomainError.notFound('Pedido');
    if (input.code && normalizeCode(input.code) !== order.code) throw new DomainError('wrong_code', 'O código não confere com este pedido.');
    order.deliverProducts({ itemIds: input.itemIds, actor: actorRef(actor, ['RECEPTIONIST', 'ADMIN', 'BARBER']), now: this.clock.now() });
    await this.orders.save(order);
    await this.events.publishFrom(order);
    return this.views.byId(orderId, 'staff');
  }

  /** Para o pedido avulso do balcão: quando cada barbeiro fica livre. */
  barbersFree(durationMin: number) {
    return this.availability.freeTimesToday(durationMin);
  }
}
