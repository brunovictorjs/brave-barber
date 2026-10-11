import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { DomainError } from '@/shared/domain/domain-error';
import type { Actor } from '@/shared/presentation/auth';
import { Clock } from '@/shared/infrastructure/clock';
import { EventBus } from '@/shared/infrastructure/event-bus';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { SettingsService } from '@/modules/business/application/settings.service';
import { OrderRepository, PaymentGateway } from '../domain/ports';
import { actorRef } from './actor';
import { orderViewInclude, OrderViews } from './order-views';

const upcoming = (): Prisma.OrderWhereInput => ({ status: { in: ['PENDING_PAYMENT', 'SCHEDULED', 'IN_SERVICE'] } });

/** "Meus pedidos": lista, detalhe e cancelamento com reembolso. */
@Injectable()
export class CustomerOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly views: OrderViews,
    private readonly orders: OrderRepository,
    private readonly gateway: PaymentGateway,
    private readonly settings: SettingsService,
    private readonly events: EventBus,
    private readonly clock: Clock,
  ) {}

  async list(actor: Actor, tab: 'upcoming' | 'history', page: number) {
    const base: Prisma.OrderWhereInput = { customerId: actor.id, status: { not: 'CART' } };
    const soon = upcoming();
    const where: Prisma.OrderWhereInput =
      tab === 'upcoming'
        ? { AND: [base, soon] }
        : { AND: [base, { status: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] } }, { NOT: soon }] };
    const pageSize = 10;
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderViewInclude,
        orderBy: tab === 'upcoming' ? [{ scheduledStart: 'asc' }, { createdAt: 'desc' }] : [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: await this.views.many(rows, 'customer'), total, page, pageSize };
  }

  async detail(actor: Actor, code: string) {
    const row = await this.views.load({ code: code.toUpperCase() });
    if (!row || row.customerId !== actor.id) throw DomainError.notFound('Pedido');
    return this.views.build(row, 'customer');
  }

  async cancel(actor: Actor, code: string) {
    const order = await this.orders.findByCode(code.toUpperCase());
    if (!order || order.snapshot.customerId !== actor.id) throw DomainError.notFound('Pedido');
    const [scheduling, payment] = await Promise.all([this.settings.get('scheduling'), this.settings.get('payment')]);
    const now = this.clock.now();
    const refunds = order.cancelByCustomer({
      now,
      policy: { refundCutoffMin: scheduling.refundCutoffMin },
      feeCents: payment.cancellationFeeCents,
      actor: actorRef(actor, ['CLIENT']),
    });
    for (const p of order.snapshot.payments) {
      if (p.status === 'CANCELLED' && p.providerRef) await this.gateway.cancel(p.providerRef);
    }
    for (const r of refunds) {
      if (!payment.autoRefund || !r.payment.providerRef) continue;
      const result = await this.gateway.refund(r.payment.providerRef, r.amountCents);
      if (result.succeeded) order.markRefunded(r.payment.id, r.amountCents, actor.id, now);
    }
    await this.orders.save(order);
    await this.events.publishFrom(order);
    return this.views.byCode(order.code, 'customer');
  }
}
