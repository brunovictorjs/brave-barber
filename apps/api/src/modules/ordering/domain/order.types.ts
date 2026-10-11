import type { Role } from '@/shared/domain/roles';

export const ORDER_STATUSES = ['CART', 'PENDING_PAYMENT', 'SCHEDULED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderOrigin = 'SITE' | 'WALK_IN';
export type OrderType = 'APPOINTMENT' | 'PICKUP';

/** Como o cliente escolheu pagar no site. */
export type PaymentChoice = 'PIX' | 'CREDIT' | 'DEBIT' | 'CASH';

/** Como o dinheiro entrou de fato. */
export const PAYMENT_METHODS = ['PIX', 'CREDIT', 'DEBIT', 'CASH', 'STORE_PIX', 'TERMINAL_DEBIT', 'TERMINAL_CREDIT'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const COUNTER_METHODS: PaymentMethod[] = ['CASH', 'STORE_PIX', 'TERMINAL_DEBIT', 'TERMINAL_CREDIT'];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX: 'Pix',
  CREDIT: 'Cartão de crédito',
  DEBIT: 'Cartão de débito',
  CASH: 'Dinheiro',
  STORE_PIX: 'Pix na loja',
  TERMINAL_DEBIT: 'Maquininha débito',
  TERMINAL_CREDIT: 'Maquininha crédito',
};

export type PaymentChannel = 'ONLINE' | 'COUNTER';
export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
export type PaymentProvider = 'STRIPE' | 'FAKE' | 'NONE';

export type ItemKind = 'SERVICE' | 'PRODUCT';

/**
 * Situação mostrada nas telas. É derivada do estado do pedido + pagamentos;
 * não é guardada no banco.
 */
export type DisplayStatus =
  | 'CART'
  | 'PROCESSING'
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'LATE'
  | 'READY_FOR_PICKUP'
  | 'IN_SERVICE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface ActorRef {
  id: string;
  name: string;
  role: Role;
}
