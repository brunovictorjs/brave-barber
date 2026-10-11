'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { duration, maskPhone, matchText, money, parseMoney } from '@/lib/format';
import type { FreeBarber, OrderView, SellableCatalog } from '@/lib/types';
import { cn } from '@/lib/utils';

const METHODS = [
  ['CASH', 'Dinheiro'],
  ['STORE_PIX', 'Pix na loja'],
  ['TERMINAL_DEBIT', 'Maquininha débito'],
  ['TERMINAL_CREDIT', 'Maquininha crédito'],
] as const;

function invalidateCounter(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['counter'] });
  void qc.invalidateQueries({ queryKey: ['admin-orders'] });
  void qc.invalidateQueries({ queryKey: ['admin-order'] });
  void qc.invalidateQueries({ queryKey: ['admin-agenda'] });
}

/** Dar baixa no pagamento (tela 51): dinheiro com troco, Pix na loja ou maquininha. */
export function PaymentDialog({ order, open, onOpenChange }: { order: OrderView | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<(typeof METHODS)[number][0]>('CASH');
  const [received, setReceived] = useState('');
  const [deliver, setDeliver] = useState(true);
  const due = order?.amountDueCents ?? 0;
  const pendingProducts = order?.items.filter((i) => i.kind === 'PRODUCT' && !i.deliveredAt) ?? [];

  useEffect(() => {
    if (open) {
      setMethod('CASH');
      setReceived(order ? money(Math.ceil(order.amountDueCents / 1000) * 1000, { forceCents: true }) : '');
      setDeliver(true);
    }
  }, [open, order]);

  const receivedCents = parseMoney(received) ?? 0;
  const change = Math.max(0, receivedCents - due);
  const pay = useMutation({
    mutationFn: () =>
      api.post<OrderView>(`/counter/orders/${order!.id}/payments`, {
        method,
        receivedCents: method === 'CASH' ? receivedCents : undefined,
        deliverProducts: pendingProducts.length > 0 && deliver,
      }),
    onSuccess: () => {
      toast.success(`Baixa de ${money(due)} registrada${method === 'CASH' && change ? ` · troco ${money(change)}` : ''}`);
      invalidateCounter(qc);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!order) return null;
  const online = order.payments.filter((p) => p.channel === 'ONLINE' && p.status === 'SUCCEEDED');
  const services = order.items.filter((i) => i.kind === 'SERVICE' && !i.addedDuringService);
  const extras = order.items.filter((i) => i.addedDuringService || i.kind === 'PRODUCT');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogTitle className="disp mb-1 pr-10 text-[20px]">Dar baixa no pagamento</DialogTitle>
        <DialogDescription className="rowx xs muted mb-4 gap-2">
          <span className="code">{order.code}</span>
          <span>
            {order.customer.name}
            {order.barber ? ` · com ${order.barber.name}` : ''}
          </span>
        </DialogDescription>
        <section className="card raised mb-4">
          {services.length ? (
            <div className="rowx m mb-2">
              <span className="muted">{services.map((s) => s.name).join(' + ')}</span>
              <span className="sp" />
              <span className="xs muted mr-2.5">{online.length ? `pago online · ${online[0]!.methodLabel}` : order.origin === 'WALK_IN' ? 'avulso' : 'dinheiro'}</span>
              <span className="num">{money(services.reduce((s, i) => s + i.totalCents, 0))}</span>
            </div>
          ) : null}
          {extras
            .filter((i) => !services.includes(i))
            .map((i) => (
              <div className="rowx m mb-2" key={i.id}>
                <span className="muted">
                  {i.name}
                  {i.quantity > 1 ? ` × ${i.quantity}` : ''}
                </span>
                <span className="sp" />
                <span className="xs muted mr-2.5">{i.addedByRole === 'CLIENT' ? 'comprado no site' : 'lançado pelo barbeiro'}</span>
                <span className="num">{money(i.totalCents)}</span>
              </div>
            ))}
          {order.paidCents ? (
            <div className="rowx m mb-2">
              <span className="muted">Já pago</span>
              <span className="sp" />
              <span className="num">{money(-order.paidCents)}</span>
            </div>
          ) : null}
          <div className="divider my-2.5" />
          <div className="rowx">
            <span className="b">A receber agora</span>
            <span className="sp" />
            <span className="price text-[22px]">{money(due)}</span>
          </div>
        </section>
        <div className="field mb-3">
          <span>Como o cliente pagou</span>
          <div className="filters m-0" role="radiogroup" aria-label="Forma de pagamento">
            {METHODS.map(([m, label]) => (
              <button key={m} type="button" role="radio" aria-checked={method === m} className={cn('chip', method === m && 'on')} onClick={() => setMethod(m)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {method === 'CASH' ? (
          <div className="g2 mb-3">
            <Field label="Valor recebido">
              <Input value={received} inputMode="decimal" onChange={(e) => setReceived(e.target.value)} aria-invalid={receivedCents < due} />
            </Field>
            <div className="field">
              <span>Troco</span>
              <div className="input">
                <b>{money(change, { forceCents: true })}</b>
              </div>
            </div>
          </div>
        ) : null}
        {pendingProducts.length ? (
          <button type="button" role="checkbox" aria-checked={deliver} onClick={() => setDeliver(!deliver)} className="rowx m w-full cursor-pointer border-0 bg-transparent pb-3.5 pt-2 text-left text-[var(--ink)]">
            <span className={cn('chk', deliver && 'on')}>
              <svg aria-hidden="true">
                <use href="#check" />
              </svg>
            </span>
            {pendingProducts.map((p) => p.name).join(', ')} {pendingProducts.length > 1 ? 'entregues' : 'entregue'} ao cliente
          </button>
        ) : null}
        <p className="xs muted mb-3.5 leading-relaxed">
          A baixa fica registrada com o seu nome e o horário. {order.status === 'COMPLETED' ? 'O pedido passa a Concluído.' : 'O pedido passa a Pago e, quando o barbeiro concluir, a Concluído.'}
        </p>
        <div className="rowx gap-2.5">
          <Button variant="dark" size="sm" className="!h-11 flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" className="!h-11 flex-[2]" onClick={() => pay.mutate()} loading={pay.isPending} disabled={due <= 0 || (method === 'CASH' && receivedCents < due)}>
            Confirmar {money(due, { forceCents: true })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Entrega de produtos com conferência do código (retirada no balcão). */
export function DeliverDialog({ order, open, onOpenChange }: { order: OrderView | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  useEffect(() => {
    if (open) setCode('');
  }, [open]);
  const deliver = useMutation({
    mutationFn: () => api.post<OrderView>(`/counter/orders/${order!.id}/deliver`, { code }),
    onSuccess: () => {
      toast.success('Produtos entregues');
      invalidateCounter(qc);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!order) return null;
  const pending = order.items.filter((i) => i.kind === 'PRODUCT' && !i.deliveredAt);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="disp mb-1 pr-10 text-[20px]">Entregar produtos</DialogTitle>
        <DialogDescription className="xs muted mb-4">
          {order.customer.name} · confirme digitando o código do pedido
        </DialogDescription>
        <div className="card raised mb-4">
          {pending.map((p) => (
            <div className="rowx m mb-1.5" key={p.id}>
              <span>
                {p.name}
                {p.quantity > 1 ? ` × ${p.quantity}` : ''}
              </span>
              <span className="sp" />
              <span className="num muted">{money(p.totalCents)}</span>
            </div>
          ))}
          {order.amountDueCents > 0 && order.type === 'PICKUP' ? <p className="xs mt-2">Receba {money(order.amountDueCents)} antes de entregar.</p> : null}
        </div>
        <Field label="Código do pedido" className="mb-4">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={order.code.replace(/[A-Z0-9]/g, '•').replace('•••-', 'BRV-')} autoFocus className="code" />
        </Field>
        <Button onClick={() => deliver.mutate()} loading={deliver.isPending} disabled={code !== order.code || (order.type === 'PICKUP' && order.amountDueCents > 0)}>
          Confirmar entrega
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Novo pedido avulso no balcão (tela 52): escolhe o barbeiro pelo horário livre. */
export function WalkInDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [q, setQ] = useState('');
  const [barber, setBarber] = useState<string | null>(null);
  const [svc, setSvc] = useState<string[]>([]);
  const [prd, setPrd] = useState<string[]>([]);
  const { data: catalog } = useQuery({ queryKey: ['staff-catalog'], queryFn: () => api.get<SellableCatalog>('/staff/catalog'), enabled: open });
  const services = catalog?.services ?? [];
  const products = catalog?.products ?? [];
  const mins = services.filter((s) => svc.includes(s.id)).reduce((a, s) => a + s.durationMin, 0);
  const total = services.filter((s) => svc.includes(s.id)).reduce((a, s) => a + s.priceCents, 0) + products.filter((p) => prd.includes(p.id)).reduce((a, p) => a + p.priceCents, 0);
  const { data: free } = useQuery({ queryKey: ['counter-barbers', mins], queryFn: () => api.get<FreeBarber[]>('/counter/barbers', { duration: mins || 40 }), enabled: open });
  const eligible = (id: string) => svc.every((s) => services.find((x) => x.id === s)?.barberIds.includes(id));

  useEffect(() => {
    if (!open) return;
    setName('');
    setPhone('');
    setQ('');
    setSvc([]);
    setPrd([]);
    setBarber(null);
  }, [open]);
  // Mantém selecionado alguém que faz todos os serviços escolhidos (preferindo quem está livre agora).
  useEffect(() => {
    if (!free?.length) return;
    if (barber && eligible(barber)) return;
    const apt = free.filter((b) => eligible(b.id));
    const next = apt.find((b) => b.freeNow) ?? apt.find((b) => b.nextFree) ?? apt[0];
    setBarber(next?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [free, barber, svc.join(','), services.length]);

  const create = useMutation({
    mutationFn: () => api.post<OrderView>('/counter/walk-ins', { customerName: name, customerPhone: phone || null, barberId: barber, serviceIds: svc, productIds: prd }),
    onSuccess: (o) => {
      toast.success(`Pedido ${o.code} enviado para ${o.barber?.firstName}`);
      invalidateCounter(qc);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const flip = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogTitle className="disp mb-1 pr-10 text-[20px]">Novo pedido avulso</DialogTitle>
        <DialogDescription className="xs muted mb-4 leading-relaxed">Cliente sem agendamento no balcão. O pedido cai na agenda do barbeiro escolhido como avulso, sem código.</DialogDescription>
        <div className="g2 mb-3.5">
          <Field label="Cliente">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Nome do cliente" />
          </Field>
          <Field label="Celular (opcional)">
            <Input value={phone} inputMode="tel" onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(81) 9 0000-0000" />
          </Field>
        </div>
        <div className="field mb-3.5">
          <span>Barbeiro</span>
          <div className="filters m-0" role="radiogroup" aria-label="Barbeiro">
            {(free ?? []).map((b) => (
              <button key={b.id} type="button" role="radio" aria-checked={barber === b.id} disabled={!eligible(b.id)} className={cn('chip', barber === b.id && 'on')} onClick={() => setBarber(b.id)}>
                {b.firstName} <b>{b.freeNow ? 'livre agora' : b.nextFree ?? 'sem folga hoje'}</b>
              </button>
            ))}
          </div>
        </div>
        <label className="input mb-3">
          <Icon name="search" size="s" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar serviço ou produto…" aria-label="Buscar serviço ou produto" />
        </label>
        <div className="field mb-3.5">
          <span>Serviços</span>
          <div className="filters m-0 max-h-[132px] overflow-y-auto" role="group" aria-label="Serviços">
            {services.filter((s) => svc.includes(s.id) || matchText(s.name, q)).map((s) => (
              <button key={s.id} type="button" aria-pressed={svc.includes(s.id)} className={cn('chip', svc.includes(s.id) && 'on')} onClick={() => flip(svc, setSvc, s.id)}>
                {s.name} <b>{money(s.priceCents)}</b>
              </button>
            ))}
            {q && !services.some((s) => matchText(s.name, q)) ? <span className="xs muted">Nenhum serviço com “{q}”.</span> : null}
          </div>
        </div>
        <div className="field mb-4">
          <span>Produtos</span>
          <div className="filters m-0 max-h-[96px] overflow-y-auto" role="group" aria-label="Produtos">
            {products.filter((p) => prd.includes(p.id) || matchText(p.name, q)).map((p) => (
              <button key={p.id} type="button" aria-pressed={prd.includes(p.id)} className={cn('chip', prd.includes(p.id) && 'on')} onClick={() => flip(prd, setPrd, p.id)}>
                {p.name} <b>{money(p.priceCents)}</b>
              </button>
            ))}
            {q && !products.some((p) => matchText(p.name, q)) ? <span className="xs muted">Nenhum produto com “{q}”.</span> : null}
          </div>
        </div>
        <div className="card raised mb-4">
          <div className="rowx">
            <span className="b">Total</span>
            <span className="sp" />
            <span className="xs muted mr-3">{duration(mins)} de cadeira</span>
            <span className="price text-[22px]">{money(total)}</span>
          </div>
        </div>
        {barber && svc.length && !eligible(barber) ? <p className="xs mb-3">Esse barbeiro não faz todos os serviços escolhidos.</p> : null}
        <div className="rowx gap-2.5">
          <Button variant="dark" size="sm" className="!h-11 flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" className="!h-11 flex-[2]" onClick={() => create.mutate()} loading={create.isPending} disabled={name.trim().length < 2 || !svc.length || !barber || !eligible(barber)}>
            Criar e enviar ao barbeiro
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
