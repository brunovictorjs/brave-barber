import type { Order } from './order';

export abstract class OrderRepository {
  abstract findById(id: string): Promise<Order | null>;
  abstract findByCode(code: string): Promise<Order | null>;
  abstract findCartOf(customerId: string): Promise<Order | null>;
  abstract findByPaymentRef(providerRef: string): Promise<Order | null>;
  abstract codeExists(code: string): Promise<boolean>;
  abstract nextWalkInSequence(): Promise<number>;
  /** Pedidos cujo prazo de pagamento online já venceu. */
  abstract findExpiredHolds(now: Date): Promise<Order[]>;
  /** Pedidos agendados cujo horário já passou e ainda não começaram. */
  abstract findLateScheduled(now: Date): Promise<Order[]>;
  abstract save(order: Order): Promise<void>;
}

export interface GatewayCharge {
  providerRef: string;
  provider: 'STRIPE' | 'FAKE';
  /** Pix: copia-e-cola. */
  pixCode?: string | null;
  /** Pix: imagem do QR (quando o gateway fornece). */
  pixQrImageUrl?: string | null;
  expiresAt?: Date | null;
  /** Cartão: segredo para o Stripe Elements confirmar no navegador. */
  clientSecret?: string | null;
}

export interface GatewayStatus {
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  feeCents: number;
  cardBrand?: string | null;
  cardLast4?: string | null;
}

/**
 * Porta do gateway de pagamento online. Em produção é o Stripe; em
 * desenvolvimento (sem chave) um gateway simulado aprova os pagamentos.
 */
export abstract class PaymentGateway {
  abstract readonly name: 'STRIPE' | 'FAKE';
  abstract createPix(input: { orderId: string; orderCode: string; amountCents: number; expiresInMinutes: number; customerEmail?: string | null }): Promise<GatewayCharge>;
  abstract createCard(input: { orderId: string; orderCode: string; amountCents: number; method: 'CREDIT' | 'DEBIT'; installments: number; customerEmail?: string | null }): Promise<GatewayCharge>;
  abstract retrieve(providerRef: string): Promise<GatewayStatus>;
  /** Só o gateway simulado aceita cartão digitado na nossa tela; o Stripe usa Elements. */
  async confirmTestCard(_providerRef: string, _card: { number: string; name: string }): Promise<GatewayStatus> {
    throw new Error('Cartão de teste só existe no gateway simulado.');
  }
  abstract refund(providerRef: string, amountCents: number): Promise<{ refundRef: string; succeeded: boolean }>;
  abstract cancel(providerRef: string): Promise<void>;
}
