import { Order, CatalogItemSnapshot } from '@/modules/ordering/domain/order';
import type { ActorRef } from '@/modules/ordering/domain/order.types';
import { DomainError } from '@/shared/domain/domain-error';

const t0 = new Date('2026-10-07T12:00:00Z');
const at = (min: number) => new Date(t0.getTime() + min * 60_000);

const client: ActorRef = { id: 'lucas', name: 'Lucas Reis', role: 'CLIENT' };
const breno: ActorRef = { id: 'breno', name: 'Breno Lima', role: 'BARBER' };
const patricia: ActorRef = { id: 'patricia', name: 'Patrícia Lopes', role: 'RECEPTIONIST' };

const corte: CatalogItemSnapshot = { kind: 'SERVICE', refId: 'corte', name: 'Corte de cabelo', categoryId: 'cabelo', categoryName: 'Cabelo', icon: 'scissor', listPriceCents: 4500, durationMin: 40 };
const barba: CatalogItemSnapshot = { kind: 'SERVICE', refId: 'barba', name: 'Desenhar barba', categoryId: 'barba', categoryName: 'Barba', icon: 'beard', listPriceCents: 3500, durationMin: 25 };
const oleo: CatalogItemSnapshot = { kind: 'PRODUCT', refId: 'oleo', name: 'Óleo para barba', categoryId: 'p-barba', categoryName: 'Barba', icon: 'drop', listPriceCents: 3800, durationMin: 0 };

function cartWithCombo(): Order {
  const order = Order.newCart({ id: 'o1', code: 'BRV-7F2K9', customerId: 'lucas', customerName: 'Lucas Reis', customerPhone: null, now: t0 });
  order.addToCart(corte, client, t0);
  order.addToCart(barba, client, t0);
  const [c, b] = order.items;
  order.applyPricing([
    { key: c!.id, listPriceCents: 4500, unitPriceCents: 4500, discountCents: 1125 },
    { key: b!.id, listPriceCents: 3500, unitPriceCents: 3500, discountCents: 875 },
  ]);
  order.schedule({ start: at(60 * 26), end: at(60 * 26 + 65), barberId: 'breno', anyBarber: true });
  return order;
}

/** Marca todos os serviços como feitos (o barbeiro aperta "Marcar" em cada um). */
function markAll(order: Order, actor: ActorRef, at: Date) {
  for (const i of order.serviceItems) order.markServiceDone(i.id, actor, at);
}

function expectError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`esperava erro ${code}`);
}

describe('Pedido — pagamento online', () => {
  it('segura o horário até o Pix confirmar e passa a Pago', () => {
    const order = cartWithCombo();
    expect(order.totalCents).toBe(6000);
    order.checkout({ choice: 'PIX', installments: 1, completionCode: 'OK-4821', holdMinutes: 10, now: t0, actor: client });
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.displayStatus(t0)).toBe('PROCESSING');

    const payment = order.attachOnlinePayment({ method: 'PIX', provider: 'FAKE', providerRef: 'pi_1', amountCents: 6000, installments: 1, pixCode: 'x', expiresAt: at(10), now: t0 });
    order.confirmOnlinePayment({ paymentId: payment.id, feeCents: 71, now: at(2) });
    expect(order.status).toBe('SCHEDULED');
    expect(order.displayStatus(at(3))).toBe('PAID');
    expect(order.pullEvents().map((e) => e.name)).toEqual(['order.paid', 'order.booked']);
  });

  it('libera o horário quando o prazo do Pix expira', () => {
    const order = cartWithCombo();
    order.checkout({ choice: 'PIX', installments: 1, completionCode: 'OK-1', holdMinutes: 10, now: t0, actor: client });
    expect(order.expireHold(at(5))).toBe(false);
    expect(order.expireHold(at(11))).toBe(true);
    expect(order.status).toBe('CANCELLED');
  });

  it('cancela com reembolso integral até o horário marcado e recusa depois', () => {
    const order = cartWithCombo();
    order.checkout({ choice: 'CREDIT', installments: 3, completionCode: 'OK-1', holdMinutes: 15, now: t0, actor: client });
    const p = order.attachOnlinePayment({ method: 'CREDIT', provider: 'FAKE', providerRef: 'pi_2', amountCents: 6000, installments: 3, pixCode: null, expiresAt: null, now: t0 });
    order.confirmOnlinePayment({ paymentId: p.id, feeCents: 278, now: t0 });

    const late = Order.restore(order.id, structuredClone(order.snapshot) as never);
    expectError(() => late.cancelByCustomer({ now: at(60 * 27), policy: { refundCutoffMin: 0 }, feeCents: 0, actor: client }), 'cancel_window_closed');

    const refunds = order.cancelByCustomer({ now: at(60), policy: { refundCutoffMin: 0 }, feeCents: 0, actor: client });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amountCents).toBe(6000);
    expect(order.status).toBe('CANCELLED');
  });

  it('só parcela no crédito', () => {
    const order = cartWithCombo();
    expectError(() => order.checkout({ choice: 'PIX', installments: 2, completionCode: 'OK-1', holdMinutes: 10, now: t0, actor: client }), 'invalid_installments');
  });
});

describe('Pedido — atendimento', () => {
  function paidOrder(): Order {
    const order = cartWithCombo();
    order.checkout({ choice: 'PIX', installments: 1, completionCode: 'OK-4821', holdMinutes: 10, now: t0, actor: client });
    const p = order.attachOnlinePayment({ method: 'PIX', provider: 'FAKE', providerRef: 'pi', amountCents: 6000, installments: 1, pixCode: null, expiresAt: null, now: t0 });
    order.confirmOnlinePayment({ paymentId: p.id, feeCents: 0, now: t0 });
    return order;
  }

  it('começa só com o código do pedido e com o barbeiro dono da agenda', () => {
    const order = paidOrder();
    expectError(() => order.start({ actor: breno, code: 'BRV-0000', now: at(60 * 26) }), 'wrong_code');
    expectError(() => order.start({ actor: { ...breno, id: 'bruno' }, code: 'BRV-7F2K9', now: at(60 * 26) }), 'not_your_order');
    order.start({ actor: breno, code: 'brv-7f2k9', now: at(60 * 26) });
    expect(order.status).toBe('IN_SERVICE');
  });

  it('extra de produto num pedido pago online vira saldo no balcão', () => {
    const order = paidOrder();
    order.start({ actor: breno, code: 'BRV-7F2K9', now: at(60 * 26) });
    order.addDuringService([oleo], breno, at(60 * 26 + 20));
    expect(order.totalCents).toBe(9800);
    expect(order.amountDueCents).toBe(3800);
    expect(order.durationMin).toBe(65); // produto não entra no tempo
  });

  it('conclui só com o código de conclusão; o saldo continua para a balconista', () => {
    const order = paidOrder();
    order.start({ actor: breno, code: 'BRV-7F2K9', now: at(60 * 26) });
    order.addDuringService([oleo], breno, at(60 * 26 + 20));
    expectError(() => order.complete({ actor: breno, now: at(60 * 27), completionCode: 'OK-4821' }), 'services_pending');
    markAll(order, breno, at(60 * 26 + 50));
    expectError(() => order.complete({ actor: breno, now: at(60 * 27), completionCode: 'OK-0000' }), 'wrong_completion_code');
    order.complete({ actor: breno, now: at(60 * 27), completionCode: 'OK-4821' });
    expect(order.status).toBe('COMPLETED');
    expect(order.displayStatus(at(60 * 27))).toBe('AWAITING_PAYMENT');

    const payment = order.recordCounterPayment({ method: 'CASH', receivedCents: 5000, actor: patricia, now: at(60 * 27 + 2) });
    expect(payment.changeCents).toBe(1200);
    expect(order.displayStatus(at(60 * 27 + 3))).toBe('COMPLETED');
  });

  it('pedido em dinheiro vira Pago quando o barbeiro digita o código de conclusão', () => {
    const order = cartWithCombo();
    order.checkout({ choice: 'CASH', installments: 1, completionCode: 'OK-7310', holdMinutes: 0, now: t0, actor: client });
    expect(order.status).toBe('SCHEDULED');
    expect(order.displayStatus(t0)).toBe('AWAITING_PAYMENT');
    order.start({ actor: breno, code: 'BRV-7F2K9', now: at(60 * 26) });
    markAll(order, breno, at(60 * 26 + 50));
    order.complete({ actor: breno, now: at(60 * 27), completionCode: 'OK-7310' });
    expect(order.amountDueCents).toBe(0);
    expect(order.snapshot.payments[0]!.method).toBe('CASH');
    expect(order.displayStatus(at(60 * 27))).toBe('COMPLETED');
  });

  it('pausar desconta do tempo de cadeira', () => {
    const order = paidOrder();
    order.start({ actor: breno, code: 'BRV-7F2K9', now: at(0) });
    order.pause(breno, at(10));
    order.resume(breno, at(15));
    expect(order.elapsedSeconds(at(30))).toBe(25 * 60);
  });
});

describe('Pedido avulso', () => {
  it('criado pelo barbeiro começa na hora, sem código, e o pagamento pode ficar com o balcão', () => {
    const order = Order.walkIn({ id: 'w1', code: 'AVL-0412', customerName: 'Rafael Souza', customerPhone: null, customerId: null, barberId: 'breno', items: [corte, barba, oleo], actor: breno, startNow: true, scheduledStart: t0, now: t0 });
    expect(order.status).toBe('IN_SERVICE');
    markAll(order, breno, at(65));
    order.complete({ actor: breno, now: at(70), payment: { mode: 'counter' } });
    expect(order.displayStatus(at(70))).toBe('AWAITING_PAYMENT');
    expect(order.amountDueCents).toBe(11800);
  });

  it('"Recebi agora" registra o pagamento com o nome do barbeiro', () => {
    const order = Order.walkIn({ id: 'w2', code: 'AVL-0413', customerName: 'Marcos Vieira', customerPhone: null, customerId: null, barberId: 'breno', items: [corte], actor: breno, startNow: true, scheduledStart: t0, now: t0 });
    markAll(order, breno, at(40));
    order.complete({ actor: breno, now: at(45), payment: { mode: 'now', method: 'STORE_PIX' } });
    expect(order.amountDueCents).toBe(0);
    expect(order.snapshot.payments[0]!.recordedByName).toBe('Breno Lima');
  });

  it('criado pela balconista entra na agenda e o barbeiro inicia sem código', () => {
    const order = Order.walkIn({ id: 'w3', code: 'AVL-0414', customerName: 'Marcos Vieira', customerPhone: null, customerId: null, barberId: 'breno', items: [corte], actor: patricia, startNow: false, scheduledStart: at(30), now: t0 });
    expect(order.status).toBe('SCHEDULED');
    order.start({ actor: breno, now: at(30) });
    expect(order.status).toBe('IN_SERVICE');
  });

  it('exige ao menos um serviço', () => {
    expectError(
      () => Order.walkIn({ id: 'w4', code: 'AVL-1', customerName: 'Fulano', customerPhone: null, customerId: null, barberId: 'breno', items: [oleo], actor: breno, startNow: true, scheduledStart: t0, now: t0 }),
      'no_services',
    );
  });
});

describe('Retirada no balcão', () => {
  it('compra só de produtos conclui quando a balconista entrega', () => {
    const order = Order.newCart({ id: 'p1', code: 'BRV-5K2R7', customerId: 'ana', customerName: 'Ana', customerPhone: null, now: t0 });
    order.addToCart(oleo, client, t0);
    expect(order.type).toBe('PICKUP');
    order.checkout({ choice: 'PIX', installments: 1, completionCode: 'x', holdMinutes: 10, now: t0, actor: client });
    expect(order.snapshot.completionCode).toBeNull();
    const p = order.attachOnlinePayment({ method: 'PIX', provider: 'FAKE', providerRef: 'pi', amountCents: 3800, installments: 1, pixCode: null, expiresAt: null, now: t0 });
    order.confirmOnlinePayment({ paymentId: p.id, feeCents: 0, now: t0 });
    expect(order.displayStatus(t0)).toBe('READY_FOR_PICKUP');
    order.deliverProducts({ actor: patricia, now: at(60) });
    expect(order.status).toBe('COMPLETED');
  });

  it('não entrega antes de receber quando a compra é em dinheiro', () => {
    const order = Order.newCart({ id: 'p2', code: 'BRV-1A1A1', customerId: 'ana', customerName: 'Ana', customerPhone: null, now: t0 });
    order.addToCart(oleo, client, t0);
    order.checkout({ choice: 'CASH', installments: 1, completionCode: 'x', holdMinutes: 0, now: t0, actor: client });
    expectError(() => order.deliverProducts({ actor: patricia, now: at(10) }), 'pay_first');
  });
});

describe('Atrasos', () => {
  it('fica atrasado depois do horário e vira falta após a tolerância', () => {
    const order = cartWithCombo();
    order.checkout({ choice: 'CASH', installments: 1, completionCode: 'OK-1', holdMinutes: 0, now: t0, actor: client });
    const start = order.snapshot.scheduledStart!;
    const after = (m: number) => new Date(start.getTime() + m * 60_000);
    expect(order.isLate(after(-1))).toBe(false);
    expect(order.isLate(after(10))).toBe(true);
    expect(order.markNoShow(after(60), 90)).toBe(false);
    expect(order.markNoShow(after(91), 90)).toBe(true);
    expect(order.status).toBe('NO_SHOW');
  });
});
