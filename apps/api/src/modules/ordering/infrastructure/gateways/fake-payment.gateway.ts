import { Injectable, Logger } from '@nestjs/common';
import { newId } from '@/shared/domain/text';
import { GatewayCharge, GatewayStatus, PaymentGateway } from '../../domain/ports';

interface FakeCharge {
  kind: 'PIX' | 'CREDIT' | 'DEBIT';
  amountCents: number;
  status: GatewayStatus['status'];
  cardBrand?: string;
  cardLast4?: string;
}

/** Taxas aproximadas do Stripe no Brasil, para os relatórios ficarem realistas. */
export function estimateFee(kind: 'PIX' | 'CREDIT' | 'DEBIT', amountCents: number): number {
  if (kind === 'PIX') return Math.round(amountCents * 0.0119);
  if (kind === 'DEBIT') return Math.round(amountCents * 0.0239);
  return Math.round(amountCents * 0.0399) + 39;
}

function brandOf(number: string): string {
  if (/^4/.test(number)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(number)) return 'mastercard';
  if (/^3[47]/.test(number)) return 'amex';
  if (/^(636368|438935|504175|451416|636297|5067|4576|4011)/.test(number)) return 'elo';
  return 'card';
}

/**
 * Gateway simulado (desenvolvimento, sem STRIPE_SECRET_KEY):
 *  • Pix: gera um copia-e-cola de mentira; "Já paguei, verificar" aprova.
 *  • Cartão: aceita qualquer número válido; 4000 0000 0000 0002 é recusado.
 * Os dados do cartão nunca são guardados — só bandeira e últimos 4 dígitos.
 */
@Injectable()
export class FakePaymentGateway extends PaymentGateway {
  readonly name = 'FAKE' as const;
  private readonly logger = new Logger('FakePaymentGateway');
  private readonly charges = new Map<string, FakeCharge>();

  async createPix(input: { orderCode: string; amountCents: number; expiresInMinutes: number }): Promise<GatewayCharge> {
    const ref = `fake_pix_${newId().slice(0, 16)}`;
    this.charges.set(ref, { kind: 'PIX', amountCents: input.amountCents, status: 'pending' });
    const amount = (input.amountCents / 100).toFixed(2);
    const pixCode = `00020126580014br.gov.bcb.pix0136${ref}5204000053039865406${amount}5802BR5912BRAVE BARBER6008CABO STO62140510${input.orderCode.replace('-', '')}6304ABCD`;
    this.logger.log(`Pix simulado criado para ${input.orderCode} (${amount})`);
    return { providerRef: ref, provider: 'FAKE', pixCode, expiresAt: new Date(Date.now() + input.expiresInMinutes * 60_000) };
  }

  async createCard(input: { orderCode: string; amountCents: number; method: 'CREDIT' | 'DEBIT' }): Promise<GatewayCharge> {
    const ref = `fake_card_${newId().slice(0, 16)}`;
    this.charges.set(ref, { kind: input.method, amountCents: input.amountCents, status: 'pending' });
    return { providerRef: ref, provider: 'FAKE', clientSecret: null };
  }

  override async confirmTestCard(providerRef: string, card: { number: string; name: string }): Promise<GatewayStatus> {
    const charge = this.charges.get(providerRef);
    if (!charge) return { status: 'failed', feeCents: 0 };
    const digits = card.number.replace(/\D/g, '');
    const valid = digits.length >= 13 && digits.length <= 19 && luhn(digits) && card.name.trim().length > 1;
    charge.status = valid && digits !== '4000000000000002' ? 'succeeded' : 'failed';
    charge.cardBrand = brandOf(digits);
    charge.cardLast4 = digits.slice(-4);
    return this.retrieve(providerRef);
  }

  async retrieve(providerRef: string): Promise<GatewayStatus> {
    const charge = this.charges.get(providerRef);
    if (!charge) {
      // Servidor reiniciou: considera aprovado para não travar o fluxo de teste.
      return { status: 'succeeded', feeCents: 0 };
    }
    // No simulado, o Pix "cai" assim que alguém verifica.
    if (charge.kind === 'PIX' && charge.status === 'pending') charge.status = 'succeeded';
    return {
      status: charge.status,
      feeCents: charge.status === 'succeeded' ? estimateFee(charge.kind, charge.amountCents) : 0,
      cardBrand: charge.cardBrand ?? null,
      cardLast4: charge.cardLast4 ?? null,
    };
  }

  async refund(providerRef: string): Promise<{ refundRef: string; succeeded: boolean }> {
    this.logger.log(`Estorno simulado de ${providerRef}`);
    return { refundRef: `fake_re_${newId().slice(0, 12)}`, succeeded: true };
  }

  async cancel(providerRef: string): Promise<void> {
    const charge = this.charges.get(providerRef);
    if (charge) charge.status = 'cancelled';
  }
}

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}
