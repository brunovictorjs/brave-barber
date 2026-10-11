import { BadRequestException, Controller, Headers, HttpCode, Logger, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import Stripe from 'stripe';
import { AppConfig } from '@/config/app-config.service';
import { Public } from '@/shared/presentation/auth';
import { CheckoutService } from '../application/checkout.service';

/**
 * Webhooks do Stripe: payment_intent.succeeded marca o pedido como Pago e
 * charge.refunded confirma o estorno. A assinatura é verificada com o corpo cru.
 */
@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly checkout: CheckoutService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('stripe')
  @HttpCode(200)
  async handle(@Req() req: Request & { rawBody?: Buffer }, @Headers('stripe-signature') signature?: string) {
    const secret = this.config.get('STRIPE_WEBHOOK_SECRET');
    const key = this.config.get('STRIPE_SECRET_KEY');
    if (!secret || !key) throw new BadRequestException({ code: 'webhook_disabled', message: 'Webhook do Stripe não configurado.' });
    if (!req.rawBody || !signature) throw new BadRequestException({ code: 'invalid_signature', message: 'Assinatura ausente.' });

    let event: Stripe.Event;
    try {
      event = new Stripe(key).webhooks.constructEvent(req.rawBody, signature, secret);
    } catch (error) {
      this.logger.warn(`Assinatura inválida: ${(error as Error).message}`);
      throw new BadRequestException({ code: 'invalid_signature', message: 'Assinatura inválida.' });
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
        await this.checkout.handleGatewayEvent(event.type, event.data.object.id);
        break;
      case 'charge.refunded': {
        const charge = event.data.object;
        const intent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
        if (intent) await this.checkout.handleGatewayEvent(event.type, intent, charge.amount_refunded);
        break;
      }
      default:
        this.logger.debug(`Evento ignorado: ${event.type}`);
    }
    return { received: true };
  }
}
