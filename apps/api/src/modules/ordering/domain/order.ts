import { AggregateRoot, DomainEvent } from '@/shared/domain/aggregate-root';
import { DomainError, invariant } from '@/shared/domain/domain-error';
import { Money } from '@/shared/domain/money';
import { newId } from '@/shared/domain/text';
import type { Role } from '@/shared/domain/roles';
import {
  ActorRef,
  DisplayStatus,
  ItemKind,
  OrderOrigin,
  OrderStatus,
  OrderType,
  PAYMENT_METHOD_LABEL,
  PaymentChannel,
  PaymentChoice,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from './order.types';

// ── Entidades internas do agregado ──────────────────────────────────────────

export interface OrderItem {
  id: string;
  kind: ItemKind;
  serviceId: string | null;
  productId: string | null;
  name: string;
  categoryId: string | null;
  categoryName: string;
  icon: string;
  listPriceCents: number;
  unitPriceCents: number;
  quantity: number;
  discountCents: number;
  durationMin: number;
  addedById: string | null;
  addedByRole: Role;
  addedDuringService: boolean;
  doneAt: Date | null;
  deliveredAt: Date | null;
  position: number;
  createdAt: Date;
}

export interface OrderPayment {
  id: string;
  method: PaymentMethod;
  channel: PaymentChannel;
  provider: PaymentProvider;
  providerRef: string | null;
  status: PaymentStatus;
  amountCents: number;
  feeCents: number;
  receivedCents: number | null;
  changeCents: number | null;
  installments: number;
  pixCode: string | null;
  expiresAt: Date | null;
  cardBrand: string | null;
  cardLast4: string | null;
  recordedById: string | null;
  recordedByName: string | null;
  confirmedAt: Date | null;
  refundedAt: Date | null;
  refundedCents: number;
  refundedById: string | null;
  createdAt: Date;
}

export interface TimelineEntry {
  id: string;
  type: string;
  description: string;
  meta: Record<string, unknown>;
  actorId: string | null;
  actorName: string | null;
  createdAt: Date;
  /** Ainda não gravado no banco. */
  isNew?: boolean;
}

/** Dados de catálogo necessários para colocar um item no pedido. */
export interface CatalogItemSnapshot {
  kind: ItemKind;
  refId: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  icon: string;
  listPriceCents: number;
  durationMin: number;
}

export interface PricedLine {
  key: string;
  unitPriceCents: number;
  listPriceCents: number;
  discountCents: number;
}

export interface OrderProps {
  code: string;
  origin: OrderOrigin;
  status: OrderStatus;
  paymentChoice: PaymentChoice | null;
  installments: number;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  barberId: string | null;
  anyBarber: boolean;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  holdExpiresAt: Date | null;
  startedAt: Date | null;
  pausedAt: Date | null;
  pausedSeconds: number;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  completionCode: string | null;
  createdById: string | null;
  discountCents: number;
  paidAt: Date | null;
  fitInAt: Date | null;
  createdAt: Date;
  items: OrderItem[];
  payments: OrderPayment[];
  timeline: TimelineEntry[];
}

export class OrderEventOf implements DomainEvent {
  readonly occurredAt = new Date();
  constructor(
    readonly name: string,
    readonly orderId: string,
    readonly payload: Record<string, unknown> = {},
  ) {}
}

export const ORDER_EVENTS = {
  booked: 'order.booked',
  paid: 'order.paid',
  cancelled: 'order.cancelled',
  started: 'order.started',
  completed: 'order.completed',
  paymentRecorded: 'order.payment_recorded',
  refunded: 'order.refunded',
  noShow: 'order.no_show',
  late: 'order.late',
} as const;

export interface CancellationPolicy {
  /** Reembolso integral até X minutos depois do horário marcado. */
  refundCutoffMin: number;
}

/**
 * Pedido — o agregado central. Guarda itens, pagamentos e a linha do tempo e
 * aplica todas as regras do ciclo de vida:
 *
 *   CART → PENDING_PAYMENT (Pix/cartão) → SCHEDULED → IN_SERVICE → COMPLETED
 *   CART → SCHEDULED (dinheiro: horário reservado, paga no balcão)
 *   avulso: criado já IN_SERVICE (pelo barbeiro) ou SCHEDULED (pela balconista)
 *   CANCELLED e NO_SHOW encerram o pedido.
 */
export class Order extends AggregateRoot {
  private constructor(
    id: string,
    private props: OrderProps,
  ) {
    super(id);
  }

  // ── Criação ───────────────────────────────────────────────────────────────

  static newCart(input: { id: string; code: string; customerId: string; customerName: string; customerPhone: string | null; now: Date }): Order {
    return new Order(input.id, {
      code: input.code,
      origin: 'SITE',
      status: 'CART',
      paymentChoice: null,
      installments: 1,
      customerId: input.customerId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      barberId: null,
      anyBarber: false,
      scheduledStart: null,
      scheduledEnd: null,
      holdExpiresAt: null,
      startedAt: null,
      pausedAt: null,
      pausedSeconds: 0,
      completedAt: null,
      cancelledAt: null,
      cancelReason: null,
      completionCode: null,
      createdById: input.customerId,
      discountCents: 0,
      paidAt: null,
      fitInAt: null,
      createdAt: input.now,
      items: [],
      payments: [],
      timeline: [],
    });
  }

  /**
   * Pedido avulso: cliente sem agendamento. Criado pelo barbeiro já começa
   * (sem conferir código); criado pela balconista entra na agenda do barbeiro
   * escolhido e ele inicia quando puder, também sem código.
   */
  static walkIn(input: {
    id: string;
    code: string;
    customerName: string;
    customerPhone: string | null;
    customerId: string | null;
    barberId: string;
    items: CatalogItemSnapshot[];
    actor: ActorRef;
    startNow: boolean;
    scheduledStart: Date;
    now: Date;
  }): Order {
    invariant(input.customerName.trim().length >= 2, 'invalid_customer', 'Informe o nome do cliente.');
    invariant(input.items.some((i) => i.kind === 'SERVICE'), 'no_services', 'Um pedido avulso precisa de ao menos um serviço.');
    const order = Order.newCart({
      id: input.id,
      code: input.code,
      customerId: input.customerId ?? '',
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone,
      now: input.now,
    });
    order.props.customerId = input.customerId;
    order.props.origin = 'WALK_IN';
    order.props.createdById = input.actor.id;
    order.props.barberId = input.barberId;
    for (const item of input.items) order.pushItem(item, input.actor, false, input.now);
    order.props.scheduledStart = input.scheduledStart;
    order.props.scheduledEnd = new Date(input.scheduledStart.getTime() + order.durationMin * 60_000);
    order.props.status = input.startNow ? 'IN_SERVICE' : 'SCHEDULED';
    if (input.startNow) order.props.startedAt = input.now;
    order.log('walk_in_created', `Pedido avulso criado por ${input.actor.name}`, input.actor, input.now);
    if (input.startNow) {
      order.log('started', 'Atendimento iniciado sem código (avulso)', input.actor, input.now);
      order.record(new OrderEventOf(ORDER_EVENTS.started, order.id));
    } else {
      order.record(new OrderEventOf(ORDER_EVENTS.booked, order.id, { walkIn: true }));
    }
    return order;
  }

  static restore(id: string, props: OrderProps): Order {
    return new Order(id, props);
  }

  // ── Leitura ───────────────────────────────────────────────────────────────

  get snapshot(): Readonly<OrderProps> {
    return this.props;
  }

  get code(): string {
    return this.props.code;
  }

  get status(): OrderStatus {
    return this.props.status;
  }

  get items(): readonly OrderItem[] {
    return this.props.items;
  }

  get serviceItems(): OrderItem[] {
    return this.props.items.filter((i) => i.kind === 'SERVICE');
  }

  get productItems(): OrderItem[] {
    return this.props.items.filter((i) => i.kind === 'PRODUCT');
  }

  get type(): OrderType {
    return this.serviceItems.length ? 'APPOINTMENT' : 'PICKUP';
  }

  get durationMin(): number {
    return this.serviceItems.reduce((sum, i) => sum + i.durationMin * i.quantity, 0);
  }

  get subtotalCents(): number {
    return this.props.items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  }

  get discountCents(): number {
    return this.props.items.reduce((sum, i) => sum + i.discountCents, 0);
  }

  get totalCents(): number {
    return this.subtotalCents - this.discountCents;
  }

  /** Quanto já entrou (pagamentos confirmados, descontados estornos). */
  get paidCents(): number {
    return this.props.payments
      .filter((p) => p.status === 'SUCCEEDED' || p.status === 'REFUNDED')
      .reduce((sum, p) => sum + p.amountCents, 0);
  }

  get refundedCents(): number {
    return this.props.payments.reduce((sum, p) => sum + p.refundedCents, 0);
  }

  get amountDueCents(): number {
    if (this.props.status === 'CANCELLED' || this.props.status === 'CART') return 0;
    return Math.max(0, this.totalCents - this.paidCents);
  }

  get isFullyPaid(): boolean {
    return this.totalCents > 0 && this.paidCents >= this.totalCents;
  }

  get onlinePaidCents(): number {
    return this.props.payments
      .filter((p) => p.channel === 'ONLINE' && (p.status === 'SUCCEEDED' || p.status === 'REFUNDED'))
      .reduce((sum, p) => sum + p.amountCents, 0);
  }

  isLate(now: Date): boolean {
    return (
      this.props.status === 'SCHEDULED' &&
      this.type === 'APPOINTMENT' &&
      this.props.origin === 'SITE' &&
      !!this.props.scheduledStart &&
      now > this.props.scheduledStart
    );
  }

  minutesLate(now: Date): number {
    if (!this.isLate(now)) return 0;
    return Math.floor((now.getTime() - this.props.scheduledStart!.getTime()) / 60_000);
  }

  /** Segundos de cadeira (descontando pausas). */
  elapsedSeconds(now: Date): number {
    const p = this.props;
    if (!p.startedAt) return 0;
    const end = p.completedAt ?? p.pausedAt ?? now;
    return Math.max(0, Math.floor((end.getTime() - p.startedAt.getTime()) / 1000) - p.pausedSeconds);
  }

  displayStatus(now: Date): DisplayStatus {
    const p = this.props;
    switch (p.status) {
      case 'CART':
        return 'CART';
      case 'PENDING_PAYMENT':
        return 'PROCESSING';
      case 'SCHEDULED':
        if (this.amountDueCents > 0) return 'AWAITING_PAYMENT';
        if (this.type === 'PICKUP') return 'READY_FOR_PICKUP';
        return this.isLate(now) ? 'LATE' : 'PAID';
      case 'IN_SERVICE':
        return 'IN_SERVICE';
      case 'COMPLETED':
        return this.amountDueCents > 0 ? 'AWAITING_PAYMENT' : 'COMPLETED';
      case 'CANCELLED':
        return 'CANCELLED';
      case 'NO_SHOW':
        return 'NO_SHOW';
    }
  }

  // ── Carrinho ──────────────────────────────────────────────────────────────

  private ensureCart(): void {
    invariant(this.props.status === 'CART', 'not_cart', 'Este pedido já foi fechado e não pode mais ser alterado.');
  }

  private pushItem(item: CatalogItemSnapshot, actor: ActorRef | null, duringService: boolean, now: Date, quantity = 1): OrderItem {
    const line: OrderItem = {
      id: newId(),
      kind: item.kind,
      serviceId: item.kind === 'SERVICE' ? item.refId : null,
      productId: item.kind === 'PRODUCT' ? item.refId : null,
      name: item.name,
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      icon: item.icon,
      listPriceCents: item.listPriceCents,
      unitPriceCents: item.listPriceCents,
      quantity,
      discountCents: 0,
      durationMin: item.kind === 'SERVICE' ? item.durationMin : 0,
      addedById: actor?.id ?? null,
      addedByRole: actor?.role ?? 'CLIENT',
      addedDuringService: duringService,
      doneAt: null,
      deliveredAt: null,
      position: this.props.items.length,
      createdAt: now,
    };
    this.props.items.push(line);
    return line;
  }

  addToCart(item: CatalogItemSnapshot, actor: ActorRef, now: Date): void {
    this.ensureCart();
    if (item.kind === 'SERVICE') {
      if (this.props.items.some((i) => i.serviceId === item.refId)) return; // serviço só entra uma vez
      // Mudou o pacote: o horário escolhido antes pode não caber mais.
      this.clearSchedule();
    } else {
      const existing = this.props.items.find((i) => i.productId === item.refId);
      if (existing) {
        invariant(existing.quantity < 10, 'too_many', 'Leve até 10 unidades de cada produto.');
        existing.quantity += 1;
        return;
      }
    }
    this.pushItem(item, actor, false, now);
  }

  setQuantity(itemId: string, quantity: number): void {
    this.ensureCart();
    const item = this.props.items.find((i) => i.id === itemId);
    if (!item) throw DomainError.notFound('Item');
    invariant(item.kind === 'PRODUCT', 'not_product', 'Só produtos têm quantidade.');
    invariant(Number.isInteger(quantity) && quantity >= 1 && quantity <= 10, 'invalid_quantity', 'Escolha de 1 a 10 unidades.');
    item.quantity = quantity;
  }

  removeFromCart(itemId: string): void {
    this.ensureCart();
    const item = this.props.items.find((i) => i.id === itemId);
    if (!item) throw DomainError.notFound('Item');
    this.props.items = this.props.items.filter((i) => i.id !== itemId);
    if (item.kind === 'SERVICE') this.clearSchedule();
  }

  private clearSchedule(): void {
    this.props.scheduledStart = null;
    this.props.scheduledEnd = null;
    this.props.barberId = null;
    this.props.anyBarber = false;
  }

  /** Atualiza preços vindos do catálogo (ofertas do dia e combos). */
  applyPricing(lines: PricedLine[]): void {
    for (const line of lines) {
      const item = this.props.items.find((i) => i.id === line.key);
      if (!item) continue;
      item.listPriceCents = line.listPriceCents;
      item.unitPriceCents = line.unitPriceCents;
      item.discountCents = line.discountCents;
    }
    this.props.discountCents = this.discountCents;
  }

  schedule(slot: { start: Date; end: Date; barberId: string; anyBarber: boolean }): void {
    this.ensureCart();
    invariant(this.type === 'APPOINTMENT', 'no_services', 'Adicione um serviço para escolher horário.');
    invariant(slot.end > slot.start, 'invalid_slot', 'Horário inválido.');
    this.props.scheduledStart = slot.start;
    this.props.scheduledEnd = slot.end;
    this.props.barberId = slot.barberId;
    this.props.anyBarber = slot.anyBarber;
  }

  // ── Checkout e pagamento online ───────────────────────────────────────────

  /**
   * Fecha o carrinho. Dinheiro: o horário fica reservado na hora e o pedido
   * aguarda pagamento no balcão. Pix/cartão: o horário fica segurado até o
   * pagamento confirmar (ou o prazo expirar).
   */
  checkout(input: { choice: PaymentChoice; installments: number; completionCode: string; holdMinutes: number; now: Date; actor: ActorRef }): void {
    this.ensureCart();
    invariant(this.props.items.length > 0, 'empty_cart', 'Seu carrinho está vazio.');
    invariant(this.totalCents > 0, 'invalid_total', 'O total do pedido precisa ser maior que zero.');
    if (this.type === 'APPOINTMENT') {
      invariant(this.props.scheduledStart && this.props.barberId, 'no_slot', 'Escolha o dia, o horário e o profissional antes de pagar.');
      invariant(this.props.scheduledStart > input.now, 'slot_past', 'Esse horário já passou. Escolha outro.');
    }
    invariant(input.installments >= 1, 'invalid_installments', 'Parcelamento inválido.');
    invariant(input.choice === 'CREDIT' || input.installments === 1, 'invalid_installments', 'Só o cartão de crédito pode ser parcelado.');

    this.props.paymentChoice = input.choice;
    this.props.installments = input.installments;
    this.props.completionCode = this.type === 'APPOINTMENT' ? input.completionCode : null;

    if (input.choice === 'CASH') {
      this.props.status = 'SCHEDULED';
      this.props.holdExpiresAt = null;
      this.log(
        'reserved_cash',
        this.type === 'APPOINTMENT' ? 'Horário reservado · pagamento em dinheiro no balcão' : 'Compra reservada · pagamento em dinheiro na retirada',
        input.actor,
        input.now,
      );
      this.record(new OrderEventOf(ORDER_EVENTS.booked, this.id, { cash: true }));
    } else {
      this.props.status = 'PENDING_PAYMENT';
      this.props.holdExpiresAt = new Date(input.now.getTime() + input.holdMinutes * 60_000);
      this.log('checkout', `Aguardando pagamento · ${PAYMENT_METHOD_LABEL[input.choice]}`, input.actor, input.now);
    }
  }

  /** Registra a cobrança criada no gateway (Pix/cartão) enquanto aguarda confirmação. */
  attachOnlinePayment(p: {
    method: 'PIX' | 'CREDIT' | 'DEBIT';
    provider: PaymentProvider;
    providerRef: string;
    amountCents: number;
    installments: number;
    pixCode: string | null;
    expiresAt: Date | null;
    now: Date;
  }): OrderPayment {
    invariant(this.props.status === 'PENDING_PAYMENT', 'not_pending', 'Este pedido não está aguardando pagamento.');
    // Uma nova tentativa substitui a anterior que ficou pendente.
    for (const old of this.props.payments) if (old.status === 'PENDING' && old.channel === 'ONLINE') old.status = 'CANCELLED';
    const payment: OrderPayment = {
      id: newId(),
      method: p.method,
      channel: 'ONLINE',
      provider: p.provider,
      providerRef: p.providerRef,
      status: 'PENDING',
      amountCents: p.amountCents,
      feeCents: 0,
      receivedCents: null,
      changeCents: null,
      installments: p.installments,
      pixCode: p.pixCode,
      expiresAt: p.expiresAt,
      cardBrand: null,
      cardLast4: null,
      recordedById: null,
      recordedByName: null,
      confirmedAt: null,
      refundedAt: null,
      refundedCents: 0,
      refundedById: null,
      createdAt: p.now,
    };
    this.props.payments.push(payment);
    return payment;
  }

  findPayment(predicate: (p: OrderPayment) => boolean): OrderPayment | undefined {
    return this.props.payments.find(predicate);
  }

  /** O gateway confirmou o pagamento (webhook ou verificação). Idempotente. */
  confirmOnlinePayment(input: { paymentId: string; feeCents: number; cardBrand?: string | null; cardLast4?: string | null; now: Date }): boolean {
    const payment = this.props.payments.find((p) => p.id === input.paymentId);
    if (!payment) throw DomainError.notFound('Pagamento');
    if (payment.status === 'SUCCEEDED') return false;
    if (this.props.status === 'CANCELLED') {
      // Pagou depois de expirar: o valor precisa voltar (a aplicação estorna).
      payment.status = 'SUCCEEDED';
      payment.confirmedAt = input.now;
      return true;
    }
    invariant(this.props.status === 'PENDING_PAYMENT', 'not_pending', 'Este pedido não está aguardando pagamento.');
    payment.status = 'SUCCEEDED';
    payment.feeCents = input.feeCents;
    payment.cardBrand = input.cardBrand ?? null;
    payment.cardLast4 = input.cardLast4 ?? null;
    payment.confirmedAt = input.now;
    this.props.status = 'SCHEDULED';
    this.props.holdExpiresAt = null;
    this.props.paidAt = input.now;
    this.log('paid', `Pago com ${PAYMENT_METHOD_LABEL[payment.method]} · ${Money.format(payment.amountCents)}`, null, input.now, {
      provider: payment.provider,
      ref: payment.providerRef,
    });
    this.record(new OrderEventOf(ORDER_EVENTS.paid, this.id, { paymentId: payment.id }));
    this.record(new OrderEventOf(ORDER_EVENTS.booked, this.id, { cash: false }));
    return true;
  }

  failOnlinePayment(paymentId: string): void {
    const payment = this.props.payments.find((p) => p.id === paymentId);
    if (payment && payment.status === 'PENDING') payment.status = 'FAILED';
  }

  /** O prazo do Pix/cartão acabou sem confirmação: o horário volta para a agenda. */
  expireHold(now: Date): boolean {
    if (this.props.status !== 'PENDING_PAYMENT' || !this.props.holdExpiresAt || this.props.holdExpiresAt > now) return false;
    for (const p of this.props.payments) if (p.status === 'PENDING') p.status = 'CANCELLED';
    this.props.status = 'CANCELLED';
    this.props.cancelledAt = now;
    this.props.cancelReason = 'Pagamento não confirmado a tempo';
    this.log('expired', 'Pagamento não confirmado a tempo · horário liberado', null, now);
    return true;
  }

  // ── Cancelamento e estorno ────────────────────────────────────────────────

  canCustomerCancel(now: Date, policy: CancellationPolicy): boolean {
    const p = this.props;
    if (p.status === 'PENDING_PAYMENT') return true;
    if (p.status !== 'SCHEDULED') return false;
    if (this.type === 'PICKUP') return !this.productItems.some((i) => i.deliveredAt);
    return !!p.scheduledStart && now.getTime() <= p.scheduledStart.getTime() + policy.refundCutoffMin * 60_000;
  }

  refundDeadline(policy: CancellationPolicy): Date | null {
    if (!this.props.scheduledStart) return null;
    return new Date(this.props.scheduledStart.getTime() + policy.refundCutoffMin * 60_000);
  }

  /**
   * Cliente cancela. Até o horário marcado o valor volta inteiro (menos a taxa
   * de cancelamento, se a casa definir). Devolve os pagamentos a estornar.
   */
  cancelByCustomer(input: { now: Date; policy: CancellationPolicy; feeCents: number; actor: ActorRef }): { payment: OrderPayment; amountCents: number }[] {
    if (!this.canCustomerCancel(input.now, input.policy)) {
      throw new DomainError('cancel_window_closed', 'O prazo para cancelar com reembolso terminou no horário marcado.');
    }
    return this.cancel(input.now, 'Cancelado pelo cliente', input.actor, input.feeCents);
  }

  /** Estorno decidido pela casa (inclusive fora do prazo). Fica registrado com o nome de quem autorizou. */
  refundByStaff(input: { now: Date; actor: ActorRef; reason: string }): { payment: OrderPayment; amountCents: number }[] {
    invariant(
      ['PENDING_PAYMENT', 'SCHEDULED', 'NO_SHOW'].includes(this.props.status),
      'cannot_refund',
      'Só pedidos que ainda não foram atendidos podem ser estornados.',
    );
    return this.cancel(input.now, input.reason, input.actor, 0);
  }

  private cancel(now: Date, reason: string, actor: ActorRef, feeCents: number) {
    const refunds: { payment: OrderPayment; amountCents: number }[] = [];
    let fee = feeCents;
    for (const p of this.props.payments) {
      if (p.status === 'PENDING') p.status = 'CANCELLED';
      if (p.status === 'SUCCEEDED' && p.channel === 'ONLINE') {
        const keep = Math.min(fee, p.amountCents);
        fee -= keep;
        if (p.amountCents - keep > 0) refunds.push({ payment: p, amountCents: p.amountCents - keep });
      }
    }
    this.props.status = 'CANCELLED';
    this.props.cancelledAt = now;
    this.props.cancelReason = reason;
    this.props.holdExpiresAt = null;
    const total = refunds.reduce((s, r) => s + r.amountCents, 0);
    this.log('cancelled', total ? `${reason} · estorno de ${Money.format(total)}` : reason, actor, now);
    this.record(new OrderEventOf(ORDER_EVENTS.cancelled, this.id, { refundCents: total }));
    return refunds;
  }

  /** O gateway confirmou o estorno. */
  markRefunded(paymentId: string, amountCents: number, actorId: string | null, now: Date): void {
    const payment = this.props.payments.find((p) => p.id === paymentId);
    if (!payment || payment.status === 'REFUNDED') return;
    payment.status = 'REFUNDED';
    payment.refundedCents = amountCents;
    payment.refundedAt = now;
    payment.refundedById = actorId;
    this.log('refunded', `Estorno de ${Money.format(amountCents)} concluído`, null, now);
    this.record(new OrderEventOf(ORDER_EVENTS.refunded, this.id, { amountCents }));
  }

  // ── Atendimento ───────────────────────────────────────────────────────────

  private ensureBarber(actor: ActorRef): void {
    if (actor.role === 'ADMIN') return;
    invariant(this.props.barberId === actor.id, 'not_your_order', 'Este pedido está na agenda de outro profissional.');
  }

  /** O barbeiro confere o código do pedido e começa. Avulsos não pedem código. */
  start(input: { actor: ActorRef; code?: string; now: Date }): void {
    invariant(this.props.status === 'SCHEDULED', 'cannot_start', this.props.status === 'IN_SERVICE' ? 'Este atendimento já começou.' : 'Este pedido não pode ser iniciado.');
    invariant(this.type === 'APPOINTMENT', 'no_services', 'Pedido sem serviços não tem atendimento.');
    this.ensureBarber(input.actor);
    if (this.props.origin === 'SITE') {
      const typed = (input.code ?? '').toUpperCase().replace(/\s/g, '');
      invariant(typed === this.props.code, 'wrong_code', 'O código não confere com este pedido.');
    }
    const late = this.isLate(input.now);
    this.props.status = 'IN_SERVICE';
    this.props.startedAt = input.now;
    this.props.pausedAt = null;
    this.props.pausedSeconds = 0;
    // A cadeira fica ocupada a partir de agora pelo tempo estimado.
    this.props.scheduledEnd = new Date(Math.max(this.props.scheduledEnd?.getTime() ?? 0, input.now.getTime() + this.durationMin * 60_000));
    this.log(
      'started',
      this.props.origin === 'SITE' ? `Atendimento iniciado com o código${late ? ' · encaixe de atrasado' : ''}` : 'Atendimento iniciado sem código (avulso)',
      input.actor,
      input.now,
      { late },
    );
    this.record(new OrderEventOf(ORDER_EVENTS.started, this.id, { late }));
  }

  pause(actor: ActorRef, now: Date): void {
    invariant(this.props.status === 'IN_SERVICE', 'not_in_service', 'O atendimento não está em andamento.');
    this.ensureBarber(actor);
    if (this.props.pausedAt) return;
    this.props.pausedAt = now;
  }

  resume(actor: ActorRef, now: Date): void {
    invariant(this.props.status === 'IN_SERVICE', 'not_in_service', 'O atendimento não está em andamento.');
    this.ensureBarber(actor);
    if (!this.props.pausedAt) return;
    this.props.pausedSeconds += Math.floor((now.getTime() - this.props.pausedAt.getTime()) / 1000);
    this.props.pausedAt = null;
  }

  /** "Marcar": o serviço daquele item foi feito. Produtos não têm Marcar. */
  markServiceDone(itemId: string, actor: ActorRef, now: Date): void {
    invariant(this.props.status === 'IN_SERVICE', 'not_in_service', 'O atendimento não está em andamento.');
    this.ensureBarber(actor);
    const item = this.props.items.find((i) => i.id === itemId);
    if (!item) throw DomainError.notFound('Item');
    invariant(item.kind === 'SERVICE', 'not_service', 'Só serviços têm o botão Marcar.');
    if (item.doneAt) return;
    item.doneAt = now;
  }

  /**
   * Extras lançados durante o atendimento. Serviços somam no tempo estimado;
   * produtos só entram no valor. Num pedido já pago online, a diferença vira
   * saldo a pagar no balcão.
   */
  addDuringService(items: CatalogItemSnapshot[], actor: ActorRef, now: Date): void {
    invariant(this.props.status === 'IN_SERVICE' || (this.props.status === 'SCHEDULED' && this.props.origin === 'WALK_IN'), 'not_in_service', 'Só dá para adicionar itens com o atendimento em andamento.');
    if (actor.role === 'BARBER') this.ensureBarber(actor);
    invariant(items.length > 0, 'no_items', 'Escolha ao menos um item.');
    let addedMinutes = 0;
    for (const item of items) {
      if (item.kind === 'SERVICE') {
        invariant(!this.props.items.some((i) => i.serviceId === item.refId), 'duplicate_service', `${item.name} já está no pedido.`);
        addedMinutes += item.durationMin;
        this.pushItem(item, actor, true, now);
      } else {
        const existing = this.props.items.find((i) => i.productId === item.refId && !i.deliveredAt && i.addedById === actor.id);
        if (existing) existing.quantity += 1;
        else this.pushItem(item, actor, true, now);
      }
    }
    if (addedMinutes && this.props.scheduledEnd) {
      this.props.scheduledEnd = new Date(this.props.scheduledEnd.getTime() + addedMinutes * 60_000);
    }
    const names = items.map((i) => i.name).join(', ');
    this.log('items_added', `Adicionado por ${actor.name}: ${names}`, actor, now);
  }

  /**
   * Conclui o atendimento.
   *  • Pedido do site: exige o código de conclusão que só o cliente vê.
   *    Se foi agendado em dinheiro, o código também marca o pedido como Pago.
   *  • Avulso: sem código; o barbeiro registra o pagamento agora ou deixa
   *    para a balconista dar baixa.
   */
  complete(input: {
    actor: ActorRef;
    now: Date;
    completionCode?: string;
    payment?: { mode: 'now'; method: PaymentMethod; receivedCents?: number } | { mode: 'counter' };
  }): void {
    invariant(this.props.status === 'IN_SERVICE', 'not_in_service', 'O atendimento não está em andamento.');
    this.ensureBarber(input.actor);
    const pending = this.serviceItems.filter((i) => !i.doneAt);
    invariant(
      pending.length === 0,
      'services_pending',
      `Marque como feito antes de concluir: ${pending.map((i) => i.name).join(', ')}.`,
    );
    if (this.props.pausedAt) this.resume(input.actor, input.now);

    if (this.props.origin === 'SITE') {
      const typed = (input.completionCode ?? '').toUpperCase().replace(/\s/g, '');
      invariant(typed === this.props.completionCode, 'wrong_completion_code', 'O código de conclusão não confere. Peça de novo ao cliente.');
      if (this.props.paymentChoice === 'CASH' && this.amountDueCents > 0) {
        this.addCounterPayment({ method: 'CASH', amountCents: this.amountDueCents, actor: input.actor, now: input.now, automatic: true });
      }
    } else if (input.payment?.mode === 'now' && this.amountDueCents > 0) {
      this.addCounterPayment({
        method: input.payment.method,
        amountCents: this.amountDueCents,
        receivedCents: input.payment.receivedCents,
        actor: input.actor,
        now: input.now,
      });
    }

    this.props.status = 'COMPLETED';
    this.props.completedAt = input.now;
    this.log(
      'completed',
      this.props.origin === 'SITE' ? 'Concluído com o código de conclusão' : this.amountDueCents > 0 ? 'Concluído · balcão recebe' : 'Concluído',
      input.actor,
      input.now,
    );
    this.record(new OrderEventOf(ORDER_EVENTS.completed, this.id));
  }

  // ── Balcão ────────────────────────────────────────────────────────────────

  private addCounterPayment(input: {
    method: PaymentMethod;
    amountCents: number;
    receivedCents?: number;
    actor: ActorRef;
    now: Date;
    automatic?: boolean;
  }): OrderPayment {
    let change: number | null = null;
    if (input.method === 'CASH' && input.receivedCents !== undefined) {
      invariant(input.receivedCents >= input.amountCents, 'insufficient_cash', 'O valor recebido é menor que o valor a pagar.');
      change = input.receivedCents - input.amountCents;
    }
    const payment: OrderPayment = {
      id: newId(),
      method: input.method,
      channel: 'COUNTER',
      provider: 'NONE',
      providerRef: null,
      status: 'SUCCEEDED',
      amountCents: input.amountCents,
      feeCents: 0,
      receivedCents: input.method === 'CASH' ? input.receivedCents ?? null : null,
      changeCents: change,
      installments: 1,
      pixCode: null,
      expiresAt: null,
      cardBrand: null,
      cardLast4: null,
      recordedById: input.actor.id,
      recordedByName: input.actor.name,
      confirmedAt: input.now,
      refundedAt: null,
      refundedCents: 0,
      refundedById: null,
      createdAt: input.now,
    };
    this.props.payments.push(payment);
    if (this.isFullyPaid) this.props.paidAt ??= input.now;
    const how = input.automatic ? ' (confirmado pelo código de conclusão)' : '';
    this.log(
      'counter_payment',
      `${Money.format(input.amountCents)} recebidos · ${PAYMENT_METHOD_LABEL[input.method]}${how} · ${input.actor.name}`,
      input.actor,
      input.now,
      { change },
    );
    this.record(new OrderEventOf(ORDER_EVENTS.paymentRecorded, this.id, { paymentId: payment.id, amountCents: input.amountCents }));
    if (this.isFullyPaid) this.record(new OrderEventOf(ORDER_EVENTS.paid, this.id, { paymentId: payment.id }));
    return payment;
  }

  /** A balconista dá baixa no que falta pagar (dinheiro, saldo de extras, avulso). */
  recordCounterPayment(input: { method: PaymentMethod; receivedCents?: number; actor: ActorRef; now: Date }): OrderPayment {
    invariant(['SCHEDULED', 'IN_SERVICE', 'COMPLETED'].includes(this.props.status), 'cannot_pay', 'Este pedido não aceita pagamento agora.');
    const due = this.amountDueCents;
    invariant(due > 0, 'nothing_due', 'Este pedido não tem valor a receber.');
    return this.addCounterPayment({ method: input.method, amountCents: due, receivedCents: input.receivedCents, actor: input.actor, now: input.now });
  }

  /**
   * Entrega de produtos no balcão. Compra só de produtos: precisa estar paga e
   * conclui o pedido quando tudo foi entregue.
   */
  deliverProducts(input: { itemIds?: string[]; actor: ActorRef; now: Date }): OrderItem[] {
    invariant(!['CART', 'PENDING_PAYMENT', 'CANCELLED'].includes(this.props.status), 'cannot_deliver', 'Este pedido não tem produtos para entregar agora.');
    const pending = this.productItems.filter((i) => !i.deliveredAt && (!input.itemIds || input.itemIds.includes(i.id)));
    invariant(pending.length > 0, 'nothing_to_deliver', 'Não há produtos pendentes de entrega neste pedido.');
    if (this.type === 'PICKUP') {
      invariant(this.amountDueCents === 0, 'pay_first', 'Receba o pagamento antes de entregar os produtos.');
    }
    for (const item of pending) item.deliveredAt = input.now;
    this.log('delivered', `Entregue por ${input.actor.name}: ${pending.map((i) => i.name).join(', ')}`, input.actor, input.now);
    if (this.type === 'PICKUP' && this.productItems.every((i) => i.deliveredAt)) {
      this.props.status = 'COMPLETED';
      this.props.completedAt = input.now;
      this.record(new OrderEventOf(ORDER_EVENTS.completed, this.id));
    }
    return pending;
  }

  // ── Atrasos e faltas ──────────────────────────────────────────────────────

  suggestFitIn(at: Date | null, now: Date): void {
    if (!this.isLate(now)) return;
    const changed = (this.props.fitInAt?.getTime() ?? null) !== (at?.getTime() ?? null);
    this.props.fitInAt = at;
    if (changed && at) {
      this.log('fit_in', 'Cliente atrasado · encaixe sugerido', null, now, { at: at.toISOString() });
      this.record(new OrderEventOf(ORDER_EVENTS.late, this.id, { fitInAt: at.toISOString() }));
    }
  }

  /** Passou da tolerância de atraso: vira falta, segue pago e sem reembolso. */
  markNoShow(now: Date, maxLateMin: number): boolean {
    if (!this.isLate(now) || this.minutesLate(now) <= maxLateMin) return false;
    this.props.status = 'NO_SHOW';
    this.props.fitInAt = null;
    this.log('no_show', `Falta: passou de ${maxLateMin} minutos de atraso`, null, now);
    this.record(new OrderEventOf(ORDER_EVENTS.noShow, this.id));
    return true;
  }

  // ── Linha do tempo ────────────────────────────────────────────────────────

  private log(type: string, description: string, actor: ActorRef | null, now: Date, meta: Record<string, unknown> = {}): void {
    this.props.timeline.push({
      id: newId(),
      type,
      description,
      meta,
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      createdAt: now,
      isNew: true,
    });
  }

  note(type: string, description: string, actor: ActorRef | null, now: Date): void {
    this.log(type, description, actor, now);
  }
}
