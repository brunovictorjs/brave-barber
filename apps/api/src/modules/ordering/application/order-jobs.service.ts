import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Clock } from '@/shared/infrastructure/clock';
import { EventBus } from '@/shared/infrastructure/event-bus';
import { SettingsService } from '@/modules/business/application/settings.service';
import { AvailabilityService } from '@/modules/scheduling/application/availability.service';
import { OrderRepository, PaymentGateway } from '../domain/ports';

/**
 * Rotinas de minuto em minuto:
 *  • libera horários de Pix/cartão que não confirmaram a tempo;
 *  • sugere encaixe para quem está atrasado;
 *  • marca falta quando passa da tolerância (segue pago, sem reembolso).
 */
@Injectable()
export class OrderJobsService {
  private readonly logger = new Logger(OrderJobsService.name);
  private running = false;

  constructor(
    private readonly orders: OrderRepository,
    private readonly gateway: PaymentGateway,
    private readonly availability: AvailabilityService,
    private readonly settings: SettingsService,
    private readonly events: EventBus,
    private readonly clock: Clock,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.expireHolds();
      await this.handleLate();
    } catch (error) {
      this.logger.error((error as Error).message, (error as Error).stack);
    } finally {
      this.running = false;
    }
  }

  async expireHolds(): Promise<void> {
    const now = this.clock.now();
    for (const order of await this.orders.findExpiredHolds(now)) {
      // Antes de liberar, confere se o pagamento não caiu nos últimos segundos.
      const pending = order.snapshot.payments.filter((p) => p.status === 'PENDING' && p.providerRef);
      let paid = false;
      for (const p of pending) {
        const status = await this.gateway.retrieve(p.providerRef!).catch(() => null);
        if (status?.status === 'succeeded' && order.status === 'PENDING_PAYMENT') {
          order.confirmOnlinePayment({ paymentId: p.id, feeCents: status.feeCents, cardBrand: status.cardBrand, cardLast4: status.cardLast4, now });
          paid = true;
        }
      }
      if (!paid && order.expireHold(now)) {
        for (const p of pending) await this.gateway.cancel(p.providerRef!).catch(() => undefined);
        this.logger.log(`Horário do pedido ${order.code} liberado (pagamento não confirmado)`);
      }
      await this.orders.save(order);
      await this.events.publishFrom(order);
    }
  }

  async handleLate(): Promise<void> {
    const now = this.clock.now();
    const { fitInMaxLateMin } = await this.settings.get('scheduling');
    for (const order of await this.orders.findLateScheduled(now)) {
      if (order.markNoShow(now, fitInMaxLateMin)) {
        this.logger.log(`Pedido ${order.code} marcado como falta`);
      } else if (order.snapshot.barberId) {
        const at = await this.availability.fitIn(order.snapshot.barberId, order.durationMin, order.id);
        order.suggestFitIn(at, now);
      }
      await this.orders.save(order);
      await this.events.publishFrom(order);
    }
  }
}
