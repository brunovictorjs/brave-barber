import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AppConfig } from '@/config/app-config.service';
import { toDateKey, formatHm, minutesOfDay } from '@/shared/domain/business-time';
import { DomainError, invariant } from '@/shared/domain/domain-error';
import { Money } from '@/shared/domain/money';
import type { Actor } from '@/shared/presentation/auth';
import { Clock } from '@/shared/infrastructure/clock';
import { EventBus } from '@/shared/infrastructure/event-bus';
import { SettingsService } from '@/modules/business/application/settings.service';
import { OfferRepository } from '@/modules/catalog/domain/repositories';
import { AvailabilityService } from '@/modules/scheduling/application/availability.service';
import { generateCompletionCode } from '../domain/codes';
import { Order } from '../domain/order';
import type { PaymentChoice } from '../domain/order.types';
import { OrderRepository, PaymentGateway } from '../domain/ports';
import { actorRef } from './actor';
import { CartService } from './cart.service';
import { CatalogItems } from './catalog-items';

export const checkoutInput = z.object({
  method: z.enum(['PIX', 'CREDIT', 'DEBIT', 'CASH']),
  installments: z.number().int().min(1).max(12).default(1),
});

export const testCardInput = z.object({
  number: z.string().min(12),
  name: z.string().min(2),
  expiry: z.string().optional(),
  cvc: z.string().optional(),
});

export type CheckoutResult =
  | { kind: 'cash'; code: string }
  | { kind: 'pix'; code: string; paymentId: string; pixCode: string | null; qrImageUrl: string | null; expiresAt: string | null; amountCents: number }
  | { kind: 'card'; code: string; paymentId: string; gateway: 'STRIPE' | 'FAKE'; clientSecret: string | null; amountCents: number; installments: number };

const METHOD_FLAG: Record<PaymentChoice, 'pix' | 'credit' | 'debit' | 'cash'> = { PIX: 'pix', CREDIT: 'credit', DEBIT: 'debit', CASH: 'cash' };

/** Fechamento do pedido e pagamento online (Pix/cartão) ou reserva em dinheiro. */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly orders: OrderRepository,
    private readonly cart: CartService,
    private readonly catalog: CatalogItems,
    private readonly gateway: PaymentGateway,
    private readonly availability: AvailabilityService,
    private readonly offers: OfferRepository,
    private readonly settings: SettingsService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  /** Opções de pagamento para a tela "Como você quer pagar". */
  async options(actor: Actor) {
    const payment = await this.settings.get('payment');
    const order = await this.orders.findCartOf(actor.id);
    const total = order ? (await this.cart.reprice(order), order.totalCents) : 0;
    const maxByValue = payment.minInstallmentCents ? Math.max(1, Math.floor(total / payment.minInstallmentCents)) : payment.maxInstallments;
    const installments = Math.max(1, Math.min(payment.maxInstallments, maxByValue));
    return {
      methods: {
        PIX: payment.methods.pix,
        CREDIT: payment.methods.credit,
        DEBIT: payment.methods.debit,
        CASH: payment.methods.cash,
      },
      maxInstallments: installments,
      installmentOptions: Array.from({ length: installments }, (_, i) => ({
        count: i + 1,
        valueCents: Math.ceil(total / (i + 1)),
        label: `${i + 1}x de ${Money.format(Math.ceil(total / (i + 1)), { forceCents: true })} sem juros`,
      })),
      gateway: this.gateway.name,
      totalCents: total,
      cancellationFeeCents: payment.cancellationFeeCents,
    };
  }

  async checkout(actor: Actor, input: z.infer<typeof checkoutInput>): Promise<CheckoutResult> {
    const order = await this.orders.findCartOf(actor.id);
    if (!order || order.items.length === 0) throw new DomainError('empty_cart', 'Seu carrinho está vazio.');
    const [payment, scheduling] = await Promise.all([this.settings.get('payment'), this.settings.get('scheduling')]);
    invariant(payment.methods[METHOD_FLAG[input.method]], 'method_disabled', 'Essa forma de pagamento não está disponível no momento.');

    // Revalida tudo que pode ter mudado desde que o item entrou no carrinho.
    await this.catalog.services(order.serviceItems.map((i) => i.serviceId!));
    await this.catalog.products(order.productItems.map((i) => i.productId!), 'SITE');
    const priced = await this.cart.reprice(order);

    if (input.method === 'CREDIT' && input.installments > 1) {
      invariant(input.installments <= payment.maxInstallments, 'invalid_installments', `Parcele em até ${payment.maxInstallments}x.`);
      invariant(
        Math.ceil(order.totalCents / input.installments) >= payment.minInstallmentCents,
        'installment_too_small',
        `Cada parcela precisa ser de pelo menos ${Money.format(payment.minInstallmentCents, { forceCents: true })}.`,
      );
    }

    const s = order.snapshot;
    if (order.type === 'APPOINTMENT') {
      invariant(s.scheduledStart && s.barberId, 'no_slot', 'Escolha o dia, o horário e o profissional antes de pagar.');
      const tz = this.config.timeZone;
      // O horário ainda está livre? (outro cliente pode ter pagado antes)
      await this.availability.resolveBooking({
        date: toDateKey(s.scheduledStart, tz),
        time: formatHm(minutesOfDay(s.scheduledStart, tz)),
        serviceIds: order.serviceItems.map((i) => i.serviceId!),
        durationMin: order.durationMin,
        barberId: s.barberId,
        ignoreOrderId: order.id,
      });
    }

    const now = this.clock.now();
    const holdMinutes = input.method === 'PIX' ? scheduling.pixHoldMin : scheduling.cardHoldMin;
    order.checkout({
      choice: input.method,
      installments: input.method === 'CREDIT' ? input.installments : 1,
      completionCode: generateCompletionCode(),
      holdMinutes,
      now,
      actor: actorRef(actor, ['CLIENT']),
    });
    await this.offers.incrementUsage(priced.offerIds);

    let result: CheckoutResult;
    if (input.method === 'CASH') {
      result = { kind: 'cash', code: order.code };
    } else {
      result = await this.charge(order, input.method, input.installments, holdMinutes, actor.email);
    }
    await this.orders.save(order);
    await this.events.publishFrom(order);
    return result;
  }

  private async charge(order: Order, method: 'PIX' | 'CREDIT' | 'DEBIT', installments: number, holdMinutes: number, email: string): Promise<CheckoutResult> {
    const now = this.clock.now();
    const amountCents = order.amountDueCents || order.totalCents;
    if (method === 'PIX') {
      const charge = await this.gateway.createPix({ orderId: order.id, orderCode: order.code, amountCents, expiresInMinutes: holdMinutes, customerEmail: email });
      const payment = order.attachOnlinePayment({
        method,
        provider: charge.provider,
        providerRef: charge.providerRef,
        amountCents,
        installments: 1,
        pixCode: charge.pixCode ?? null,
        expiresAt: charge.expiresAt ?? order.snapshot.holdExpiresAt,
        now,
      });
      return {
        kind: 'pix',
        code: order.code,
        paymentId: payment.id,
        pixCode: charge.pixCode ?? null,
        qrImageUrl: charge.pixQrImageUrl ?? null,
        expiresAt: (charge.expiresAt ?? order.snapshot.holdExpiresAt)?.toISOString() ?? null,
        amountCents,
      };
    }
    const charge = await this.gateway.createCard({ orderId: order.id, orderCode: order.code, amountCents, method, installments, customerEmail: email });
    const payment = order.attachOnlinePayment({
      method,
      provider: charge.provider,
      providerRef: charge.providerRef,
      amountCents,
      installments: method === 'CREDIT' ? installments : 1,
      pixCode: null,
      expiresAt: order.snapshot.holdExpiresAt,
      now,
    });
    return { kind: 'card', code: order.code, paymentId: payment.id, gateway: charge.provider, clientSecret: charge.clientSecret ?? null, amountCents, installments };
  }

  private async customerOrder(actor: Actor, code: string): Promise<Order> {
    const order = await this.orders.findByCode(code.toUpperCase());
    if (!order || order.snapshot.customerId !== actor.id) throw DomainError.notFound('Pedido');
    return order;
  }

  /** Nova tentativa (Pix expirou na tela, trocou de cartão…) enquanto o horário está segurado. */
  async retry(actor: Actor, code: string, input: z.infer<typeof checkoutInput>): Promise<CheckoutResult> {
    const order = await this.customerOrder(actor, code);
    invariant(order.status === 'PENDING_PAYMENT', 'not_pending', 'Este pedido não está aguardando pagamento.');
    invariant(input.method !== 'CASH', 'invalid_method', 'Para pagar em dinheiro, cancele e faça o pedido de novo.');
    const scheduling = await this.settings.get('scheduling');
    for (const p of order.snapshot.payments) if (p.status === 'PENDING' && p.providerRef) await this.gateway.cancel(p.providerRef);
    const result = await this.charge(order, input.method, input.installments, input.method === 'PIX' ? scheduling.pixHoldMin : scheduling.cardHoldMin, actor.email);
    await this.orders.save(order);
    return result;
  }

  /** "Já paguei, verificar" e retorno do cartão: consulta o gateway. */
  async verify(actor: Actor, code: string) {
    const order = await this.customerOrder(actor, code);
    await this.syncPending(order);
    return { code: order.code, status: order.status };
  }

  async confirmTestCard(actor: Actor, code: string, card: z.infer<typeof testCardInput>) {
    invariant(this.gateway.name === 'FAKE', 'not_test_mode', 'O pagamento com cartão é feito pelo Stripe.');
    const order = await this.customerOrder(actor, code);
    const pending = order.findPayment((p) => p.status === 'PENDING' && p.channel === 'ONLINE');
    if (!pending?.providerRef) throw new DomainError('no_pending_payment', 'Não há pagamento pendente neste pedido.');
    const status = await this.gateway.confirmTestCard(pending.providerRef, card);
    if (status.status !== 'succeeded') {
      order.failOnlinePayment(pending.id);
      await this.orders.save(order);
      throw new DomainError('card_declined', 'O cartão foi recusado. Confira os dados ou use outro cartão.');
    }
    order.confirmOnlinePayment({ paymentId: pending.id, feeCents: status.feeCents, cardBrand: status.cardBrand, cardLast4: status.cardLast4, now: this.clock.now() });
    await this.orders.save(order);
    await this.events.publishFrom(order);
    return { code: order.code, status: order.status };
  }

  private async syncPending(order: Order): Promise<void> {
    const pending = order.snapshot.payments.filter((p) => p.status === 'PENDING' && p.providerRef);
    for (const p of pending) {
      const status = await this.gateway.retrieve(p.providerRef!);
      if (status.status === 'succeeded') {
        order.confirmOnlinePayment({ paymentId: p.id, feeCents: status.feeCents, cardBrand: status.cardBrand, cardLast4: status.cardLast4, now: this.clock.now() });
      } else if (status.status === 'failed' || status.status === 'cancelled') {
        order.failOnlinePayment(p.id);
      }
    }
    await this.orders.save(order);
    await this.events.publishFrom(order);
    await this.refundIfPaidAfterCancel(order);
  }

  /** Pagamento que chegou depois de o pedido expirar: devolve o dinheiro. */
  private async refundIfPaidAfterCancel(order: Order): Promise<void> {
    if (order.status !== 'CANCELLED') return;
    for (const p of order.snapshot.payments) {
      if (p.status === 'SUCCEEDED' && p.channel === 'ONLINE' && p.providerRef) {
        const refund = await this.gateway.refund(p.providerRef, p.amountCents);
        if (refund.succeeded) order.markRefunded(p.id, p.amountCents, null, this.clock.now());
      }
    }
    await this.orders.save(order);
    await this.events.publishFrom(order);
  }

  /** Webhooks do Stripe. */
  async handleGatewayEvent(type: string, providerRef: string, refundedCents?: number): Promise<void> {
    const order = await this.orders.findByPaymentRef(providerRef);
    if (!order) {
      this.logger.warn(`Evento ${type} para ${providerRef} sem pedido correspondente`);
      return;
    }
    const payment = order.findPayment((p) => p.providerRef === providerRef)!;
    if (type === 'payment_intent.succeeded' || type === 'payment_intent.payment_failed' || type === 'payment_intent.canceled') {
      await this.syncPending(order);
      return;
    }
    if (type === 'charge.refunded') {
      order.markRefunded(payment.id, refundedCents ?? payment.amountCents, null, this.clock.now());
      await this.orders.save(order);
      await this.events.publishFrom(order);
    }
  }
}
