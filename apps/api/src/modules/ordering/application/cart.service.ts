import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppConfig } from '@/config/app-config.service';
import { avatarFor, fullName } from '@/shared/domain/avatar';
import { formatHm, minutesOfDay, toDateKey } from '@/shared/domain/business-time';
import { DomainError } from '@/shared/domain/domain-error';
import { newId } from '@/shared/domain/text';
import type { Actor } from '@/shared/presentation/auth';
import { Clock } from '@/shared/infrastructure/clock';
import { EventBus } from '@/shared/infrastructure/event-bus';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { PricingService } from '@/modules/catalog/application/pricing.service';
import { AvailabilityService } from '@/modules/scheduling/application/availability.service';
import { generateOrderCode } from '../domain/codes';
import { Order } from '../domain/order';
import { OrderRepository } from '../domain/ports';
import { actorRef } from './actor';
import { CatalogItems } from './catalog-items';

export const addItemInput = z
  .object({ serviceId: z.string().optional(), productId: z.string().optional() })
  .refine((v) => !!v.serviceId !== !!v.productId, 'Informe um serviço ou um produto');

export const scheduleInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  barberId: z.string().nullable(),
});

/**
 * Carrinho do cliente. É um pedido em estado CART guardado no servidor, então
 * aparece no admin como "No carrinho" e sobrevive entre aparelhos.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly catalog: CatalogItems,
    private readonly pricing: PricingService,
    private readonly availability: AvailabilityService,
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async uniqueCode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const code = generateOrderCode();
      if (!(await this.orders.codeExists(code))) return code;
    }
    throw new Error('Não foi possível gerar um código único de pedido.');
  }

  private async cartOf(actor: Actor, create: boolean): Promise<Order | null> {
    const existing = await this.orders.findCartOf(actor.id);
    if (existing || !create) return existing;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    return Order.newCart({
      id: newId(),
      code: await this.uniqueCode(),
      customerId: actor.id,
      customerName: fullName(user),
      customerPhone: user.phone,
      now: this.clock.now(),
    });
  }

  /** Recalcula preços com as ofertas do dia do atendimento (ou de hoje). */
  async reprice(order: Order) {
    const s = order.snapshot;
    const day = s.scheduledStart ? toDateKey(s.scheduledStart, this.config.timeZone) : toDateKey(this.clock.now(), this.config.timeZone);
    const result = await this.pricing.price(
      order.items.map((i) => ({
        key: i.id,
        kind: i.kind,
        refId: (i.serviceId ?? i.productId)!,
        listPriceCents: i.listPriceCents,
        quantity: i.quantity,
      })),
      day,
    );
    order.applyPricing(result.lines);
    return result;
  }

  async view(actor: Actor) {
    const order = await this.cartOf(actor, false);
    return this.toView(order);
  }

  private async toView(order: Order | null) {
    const suggestion = await this.suggestion(order);
    if (!order || order.items.length === 0) {
      return { id: order?.id ?? null, items: [], combos: [], offers: [], subtotalCents: 0, discountCents: 0, totalCents: 0, durationMin: 0, count: 0, type: null, schedule: null, suggestion };
    }
    const pricing = await this.reprice(order);
    const s = order.snapshot;
    const tz = this.config.timeZone;
    const barber = s.barberId
      ? await this.prisma.user.findUnique({ where: { id: s.barberId }, include: { staffProfile: true } })
      : null;
    return {
      id: order.id,
      items: order.items.map((i) => {
        const line = pricing.lines.find((l) => l.key === i.id);
        return {
          id: i.id,
          kind: i.kind,
          refId: i.serviceId ?? i.productId,
          name: i.name,
          icon: i.icon,
          categoryName: i.categoryName,
          durationMin: i.durationMin,
          quantity: i.quantity,
          listPriceCents: i.listPriceCents,
          unitPriceCents: i.unitPriceCents,
          discountCents: i.discountCents,
          offerName: line?.offerName ?? null,
        };
      }),
      combos: pricing.combos,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      totalCents: order.totalCents,
      durationMin: order.durationMin,
      count: order.items.reduce((sum, i) => sum + i.quantity, 0),
      type: order.type,
      schedule:
        s.scheduledStart && s.scheduledEnd
          ? {
              date: toDateKey(s.scheduledStart, tz),
              time: formatHm(minutesOfDay(s.scheduledStart, tz)),
              endTime: formatHm(minutesOfDay(s.scheduledEnd, tz)),
              start: s.scheduledStart.toISOString(),
              anyBarber: s.anyBarber,
              barber: barber
                ? { id: barber.id, name: fullName(barber), firstName: barber.firstName, headline: barber.staffProfile?.headline ?? '', avatar: avatarFor(barber) }
                : null,
            }
          : null,
      suggestion,
    };
  }

  /** "Leve junto": um produto à venda online que ainda não está no carrinho. */
  private async suggestion(order: Order | null) {
    const inCart = new Set((order?.items ?? []).map((i) => i.productId).filter(Boolean) as string[]);
    if (order && order.type !== 'APPOINTMENT') return null;
    const products = await this.prisma.product.findMany({
      where: { available: true, sellOnline: true, id: { notIn: [...inCart] } },
      orderBy: [{ highlight: 'desc' }, { name: 'asc' }],
      take: 1,
    });
    const p = products[0];
    return p ? { id: p.id, name: p.name, priceCents: p.priceCents, icon: p.icon, detail: p.detail } : null;
  }

  private async persist(order: Order) {
    await this.reprice(order);
    await this.orders.save(order);
    await this.events.publishFrom(order);
    return this.toView(order);
  }

  async add(actor: Actor, input: z.infer<typeof addItemInput>) {
    const order = (await this.cartOf(actor, true))!;
    const [item] = input.serviceId ? await this.catalog.services([input.serviceId]) : await this.catalog.products([input.productId!], 'SITE');
    order.addToCart(item!, actorRef(actor, ['CLIENT']), this.clock.now());
    return this.persist(order);
  }

  async remove(actor: Actor, itemId: string) {
    const order = await this.cartOf(actor, false);
    if (!order) throw DomainError.notFound('Carrinho');
    order.removeFromCart(itemId);
    return this.persist(order);
  }

  async setQuantity(actor: Actor, itemId: string, quantity: number) {
    const order = await this.cartOf(actor, false);
    if (!order) throw DomainError.notFound('Carrinho');
    order.setQuantity(itemId, quantity);
    return this.persist(order);
  }

  async schedule(actor: Actor, input: z.infer<typeof scheduleInput>) {
    const order = await this.cartOf(actor, false);
    if (!order || !order.serviceItems.length) throw new DomainError('no_services', 'Adicione um serviço ao carrinho antes de escolher o horário.');
    const slot = await this.availability.resolveBooking({
      date: input.date,
      time: input.time,
      serviceIds: order.serviceItems.map((i) => i.serviceId!),
      durationMin: order.durationMin,
      barberId: input.barberId,
      ignoreOrderId: order.id,
    });
    order.schedule({ ...slot, anyBarber: input.barberId === null });
    return this.persist(order);
  }
}
