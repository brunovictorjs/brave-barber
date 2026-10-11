import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { DomainError } from '@/shared/domain/domain-error';
import { GatewayCharge, GatewayStatus, PaymentGateway } from '../../domain/ports';

/**
 * Stripe (produção ou sandbox). Pix é confirmado no servidor e devolve o QR;
 * cartão devolve o client_secret para o Stripe Elements no navegador — os
 * dados do cartão nunca passam pelo nosso servidor.
 */
@Injectable()
export class StripePaymentGateway extends PaymentGateway {
  readonly name = 'STRIPE' as const;
  private readonly logger = new Logger('StripePaymentGateway');

  constructor(private readonly stripe: Stripe) {
    super();
  }

  async createPix(input: { orderId: string; orderCode: string; amountCents: number; expiresInMinutes: number; customerEmail?: string | null }): Promise<GatewayCharge> {
    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: input.amountCents,
        currency: 'brl',
        payment_method_types: ['pix'],
        payment_method_data: { type: 'pix' },
        payment_method_options: { pix: { expires_after_seconds: input.expiresInMinutes * 60 } },
        confirm: true,
        receipt_email: input.customerEmail ?? undefined,
        description: `Brave Barber · pedido ${input.orderCode}`,
        metadata: { orderId: input.orderId, orderCode: input.orderCode },
      });
      const qr = (intent.next_action as { pix_display_qr_code?: { data?: string; image_url_png?: string; expires_at?: number } } | null)
        ?.pix_display_qr_code;
      return {
        providerRef: intent.id,
        provider: 'STRIPE',
        pixCode: qr?.data ?? null,
        pixQrImageUrl: qr?.image_url_png ?? null,
        expiresAt: qr?.expires_at ? new Date(qr.expires_at * 1000) : null,
      };
    } catch (error) {
      this.logger.error((error as Error).message);
      throw new DomainError('gateway_error', 'Não foi possível gerar o Pix agora. Tente de novo em instantes.');
    }
  }

  async createCard(input: { orderId: string; orderCode: string; amountCents: number; method: 'CREDIT' | 'DEBIT'; installments: number; customerEmail?: string | null }): Promise<GatewayCharge> {
    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: input.amountCents,
        currency: 'brl',
        payment_method_types: ['card'],
        payment_method_options: input.method === 'CREDIT' && input.installments > 1 ? { card: { installments: { enabled: true } } } : undefined,
        receipt_email: input.customerEmail ?? undefined,
        description: `Brave Barber · pedido ${input.orderCode}`,
        metadata: { orderId: input.orderId, orderCode: input.orderCode, installments: String(input.installments), method: input.method },
      });
      return { providerRef: intent.id, provider: 'STRIPE', clientSecret: intent.client_secret };
    } catch (error) {
      this.logger.error((error as Error).message);
      throw new DomainError('gateway_error', 'Não foi possível iniciar o pagamento com cartão agora.');
    }
  }

  async retrieve(providerRef: string): Promise<GatewayStatus> {
    const intent = await this.stripe.paymentIntents.retrieve(providerRef, { expand: ['latest_charge.balance_transaction'] });
    const charge = intent.latest_charge as Stripe.Charge | null;
    const balance = charge?.balance_transaction as Stripe.BalanceTransaction | null | undefined;
    const card = charge?.payment_method_details?.card;
    const status: GatewayStatus['status'] =
      intent.status === 'succeeded' ? 'succeeded' : intent.status === 'canceled' ? 'cancelled' : intent.status === 'requires_payment_method' && charge ? 'failed' : 'pending';
    return { status, feeCents: balance?.fee ?? 0, cardBrand: card?.brand ?? null, cardLast4: card?.last4 ?? null };
  }

  async refund(providerRef: string, amountCents: number): Promise<{ refundRef: string; succeeded: boolean }> {
    try {
      const refund = await this.stripe.refunds.create({ payment_intent: providerRef, amount: amountCents });
      return { refundRef: refund.id, succeeded: refund.status === 'succeeded' };
    } catch (error) {
      this.logger.error((error as Error).message);
      throw new DomainError('refund_failed', 'O Stripe recusou o estorno. Confira o pagamento no painel do Stripe.');
    }
  }

  async cancel(providerRef: string): Promise<void> {
    await this.stripe.paymentIntents.cancel(providerRef).catch(() => undefined);
  }
}
