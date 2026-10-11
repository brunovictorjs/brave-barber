import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppConfig } from '@/config/app-config.service';
import { DateKey, dayRange, formatHm, minutesOfDay, parseHm, toDateKey, weekdayOf } from '@/shared/domain/business-time';
import { DomainError, invariant } from '@/shared/domain/domain-error';
import { newId } from '@/shared/domain/text';
import type { Actor } from '@/shared/presentation/auth';
import { hasRole } from '@/shared/presentation/auth';
import { Clock } from '@/shared/infrastructure/clock';
import { EventBus } from '@/shared/infrastructure/event-bus';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { SettingsService } from '@/modules/business/application/settings.service';
import { CommissionService } from '@/modules/commissions/application/commission.service';
import { AvailabilityService } from '@/modules/scheduling/application/availability.service';
import { formatWalkInCode, normalizeCode } from '../domain/codes';
import { Order } from '../domain/order';
import { COUNTER_METHODS, PaymentMethod } from '../domain/order.types';
import { OrderRepository } from '../domain/ports';
import { actorRef } from './actor';
import { CartService } from './cart.service';
import { CatalogItems } from './catalog-items';
import { orderViewInclude, OrderViews } from './order-views';

export const addItemsInput = z.object({
  serviceIds: z.array(z.string()).default([]),
  productIds: z.array(z.string()).default([]),
});

const counterMethod = z.enum(COUNTER_METHODS as [PaymentMethod, ...PaymentMethod[]]);

export const completeInput = z.object({
  completionCode: z.string().optional(),
  payment: z
    .discriminatedUnion('mode', [
      z.object({ mode: z.literal('now'), method: counterMethod, receivedCents: z.number().int().positive().optional() }),
      z.object({ mode: z.literal('counter') }),
    ])
    .optional(),
});

export const walkInInput = z.object({
  customerName: z.string().trim().min(2, 'Informe o nome do cliente'),
  customerPhone: z.string().trim().optional().nullable(),
  serviceIds: z.array(z.string()).min(1, 'Escolha ao menos um serviço'),
  productIds: z.array(z.string()).default([]),
  barberId: z.string().optional(),
});

/**
 * Operação do barbeiro: agenda do dia, conferência do código, atendimento,
 * extras, conclusão e pedido avulso (este também usado pela balconista).
 */
@Injectable()
export class StaffOrdersService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly views: OrderViews,
    private readonly catalog: CatalogItems,
    private readonly cart: CartService,
    private readonly commissions: CommissionService,
    private readonly availability: AvailabilityService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  private get tz() {
    return this.config.timeZone;
  }

  private async load(actor: Actor, orderId: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (!order) throw DomainError.notFound('Pedido');
    if (!hasRole(actor, 'ADMIN', 'RECEPTIONIST') && order.snapshot.barberId !== actor.id) {
      throw DomainError.forbidden('Este pedido está na agenda de outro profissional.');
    }
    return order;
  }

  private async save(order: Order) {
    await this.orders.save(order);
    await this.events.publishFrom(order);
  }

  /** Agenda do dia do barbeiro: indicadores, quem está agora e a sequência. */
  async agenda(actor: Actor, date?: DateKey) {
    const day = date ?? toDateKey(this.clock.now(), this.tz);
    const { start, end } = dayRange(day, this.tz);
    const now = this.clock.now();
    const rows = await this.prisma.order.findMany({
      where: {
        barberId: actor.id,
        type: 'APPOINTMENT',
        status: { in: ['SCHEDULED', 'IN_SERVICE', 'COMPLETED', 'NO_SHOW'] },
        scheduledStart: { gte: start, lt: end },
      },
      include: orderViewInclude,
      orderBy: { scheduledStart: 'asc' },
    });
    const list = await this.views.many(rows, 'staff');

    const hours = await this.settings.get('hours');
    const h = hours.weekly.find((w) => w.weekday === weekdayOf(day));
    const openMin = h?.open && h.close ? parseHm(h.close) - parseHm(h.open) - (h.breakStart && h.breakEnd ? parseHm(h.breakEnd) - parseHm(h.breakStart) : 0) : 0;
    const active = list.filter((o) => o.status !== 'NO_SHOW');
    const chairMin = active.reduce((s, o) => s + o.durationMin, 0);

    // Prévia do que o barbeiro recebe pelos atendimentos do dia.
    let earnings = 0;
    for (const o of active) earnings += (await this.commissions.preview(o.id, actor.id)).totalCents;
    const yesterdayRange = dayRange(toDateKey(new Date(start.getTime() - 3600_000), this.tz), this.tz);
    const prev = await this.prisma.commissionLine.aggregate({
      where: { barberId: actor.id, order: { completedAt: { gte: yesterdayRange.start, lt: yesterdayRange.end } } },
      _sum: { amountCents: true },
    });

    const current = list.find((o) => o.status === 'IN_SERVICE') ?? list.find((o) => o.status === 'SCHEDULED' && new Date(o.scheduledEnd!) > now) ?? null;
    const upcoming = list.filter((o) => o.id !== current?.id && o.status === 'SCHEDULED');

    // Folgas para encaixe entre os próximos atendimentos.
    const gaps: { time: string; minutes: number }[] = [];
    if (h?.open && h.close && day === toDateKey(now, this.tz)) {
      const rules = await this.settings.get('scheduling');
      let cursor = Math.max(minutesOfDay(now, this.tz), parseHm(h.open));
      for (const o of active.filter((x) => x.status !== 'COMPLETED')) {
        const s = minutesOfDay(new Date(o.scheduledStart!), this.tz);
        const e = minutesOfDay(new Date(o.scheduledEnd!), this.tz);
        if (s - cursor >= rules.slotIntervalMin) gaps.push({ time: formatHm(cursor), minutes: s - cursor });
        cursor = Math.max(cursor, e + rules.bufferMin);
      }
      const close = parseHm(h.close);
      if (close - cursor >= rules.slotIntervalMin) gaps.push({ time: formatHm(cursor), minutes: Math.min(close - cursor, rules.slotIntervalMin) });
    }

    return {
      date: day,
      kpis: {
        total: active.length,
        done: active.filter((o) => o.status === 'COMPLETED').length,
        chairMinutes: chairMin,
        occupancyPct: openMin ? Math.min(100, Math.round((chairMin / openMin) * 100)) : 0,
        earningsCents: earnings,
        earningsDeltaPct: prev._sum.amountCents ? Math.round(((earnings - prev._sum.amountCents) / prev._sum.amountCents) * 100) : null,
      },
      current,
      upcoming,
      completed: list.filter((o) => o.status === 'COMPLETED'),
      gaps: gaps.slice(0, 3),
    };
  }

  /** Busca por prefixo do código entre os pedidos de hoje do barbeiro. */
  async lookup(actor: Actor, partial: string) {
    const code = normalizeCode(partial.startsWith('BRV-') ? partial : `BRV-${partial}`);
    if (code.length < 7) return { matches: [] };
    const today = toDateKey(this.clock.now(), this.tz);
    const { start, end } = dayRange(today, this.tz);
    const rows = await this.prisma.order.findMany({
      where: {
        code: { startsWith: code },
        origin: 'SITE',
        status: { in: ['SCHEDULED', 'IN_SERVICE'] },
        scheduledStart: { gte: new Date(start.getTime() - 3600_000), lt: end },
        barberId: hasRole(actor, 'ADMIN') ? undefined : actor.id,
      },
      include: orderViewInclude,
      take: 3,
    });
    return { matches: await this.views.many(rows, 'staff') };
  }

  async start(actor: Actor, input: { code?: string; orderId?: string }) {
    let order: Order | null = null;
    if (input.orderId) order = await this.load(actor, input.orderId);
    else if (input.code) order = await this.orders.findByCode(normalizeCode(input.code));
    if (!order) throw new DomainError('wrong_code', 'Nenhum pedido de hoje tem esse código.');
    order.start({ actor: actorRef(actor), code: input.code, now: this.clock.now() });
    await this.save(order);
    return this.views.byId(order.id, 'staff');
  }

  async detail(actor: Actor, orderId: string) {
    await this.load(actor, orderId);
    return this.views.byId(orderId, 'staff');
  }

  async addItems(actor: Actor, orderId: string, input: z.infer<typeof addItemsInput>) {
    const order = await this.load(actor, orderId);
    const items = [...(await this.catalog.services(input.serviceIds)), ...(await this.catalog.products(input.productIds, 'STAFF'))];
    order.addDuringService(items, actorRef(actor), this.clock.now());
    await this.save(order);
    return this.views.byId(orderId, 'staff');
  }

  async markDone(actor: Actor, orderId: string, itemId: string) {
    const order = await this.load(actor, orderId);
    order.markServiceDone(itemId, actorRef(actor), this.clock.now());
    await this.save(order);
    return this.views.byId(orderId, 'staff');
  }

  async pause(actor: Actor, orderId: string, paused: boolean) {
    const order = await this.load(actor, orderId);
    if (paused) order.pause(actorRef(actor), this.clock.now());
    else order.resume(actorRef(actor), this.clock.now());
    await this.save(order);
    return this.views.byId(orderId, 'staff');
  }

  /** Dados da folha "Concluir": tempo real, saldo no balcão e a prévia da comissão. */
  async completionPreview(actor: Actor, orderId: string) {
    const order = await this.load(actor, orderId);
    const view = await this.views.byId(orderId, 'staff');
    const commission = await this.commissions.preview(orderId, order.snapshot.barberId ?? undefined);
    return { order: view, commission };
  }

  async complete(actor: Actor, orderId: string, input: z.infer<typeof completeInput>) {
    const order = await this.load(actor, orderId);
    order.complete({ actor: actorRef(actor), now: this.clock.now(), completionCode: input.completionCode, payment: input.payment });
    await this.save(order);
    return this.views.byId(orderId, 'staff');
  }

  async walkIn(actor: Actor, input: z.infer<typeof walkInInput>) {
    const ref = actorRef(actor);
    const byBarber = ref.role === 'BARBER' && (!input.barberId || input.barberId === actor.id);
    const barberId = byBarber ? actor.id : input.barberId;
    invariant(barberId, 'no_barber', 'Escolha o barbeiro que vai atender.');
    const barber = await this.prisma.user.findFirst({ where: { id: barberId, active: true, roles: { contains: 'BARBER' } } });
    if (!barber) throw new DomainError('invalid_barber', 'Escolha um barbeiro ativo.');

    const items = [...(await this.catalog.services(input.serviceIds)), ...(await this.catalog.products(input.productIds, 'STAFF'))];
    const now = this.clock.now();
    const duration = items.reduce((s, i) => s + i.durationMin, 0);

    // Barbeiro começa na hora; balconista coloca na próxima folga do barbeiro.
    let scheduledStart = now;
    if (!byBarber) {
      const free = (await this.availability.freeTimesToday(duration)).find((b) => b.id === barberId);
      scheduledStart = free?.startsAt && free.startsAt > now ? free.startsAt : now;
    }

    let code = formatWalkInCode(await this.orders.nextWalkInSequence());
    while (await this.orders.codeExists(code)) code = formatWalkInCode(Number(code.slice(4)) + 1);

    const order = Order.walkIn({
      id: newId(),
      code,
      customerName: input.customerName,
      customerPhone: input.customerPhone ?? null,
      customerId: null,
      barberId,
      items,
      actor: ref,
      startNow: byBarber,
      scheduledStart,
      now,
    });
    await this.cart.reprice(order);
    await this.save(order);
    return this.views.byId(order.id, 'staff');
  }

  /** Notificações recentes do barbeiro ficam no módulo de engajamento; aqui só o resumo dos pedidos. */
  async todayFor(barberId: string) {
    const today = toDateKey(this.clock.now(), this.tz);
    const { start, end } = dayRange(today, this.tz);
    return this.prisma.order.count({ where: { barberId, scheduledStart: { gte: start, lt: end }, status: { in: ['SCHEDULED', 'IN_SERVICE'] } } });
  }
}
