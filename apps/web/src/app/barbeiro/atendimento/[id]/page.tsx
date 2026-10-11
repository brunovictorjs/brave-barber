'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, Note } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { Body, Foot, Screen, TopNav } from '@/components/client/shell';
import { ChromeText, Pulse, Reveal } from '@/components/motion/motion';
import { CodePad } from '@/components/staff/code-pad';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { api, errorMessage } from '@/lib/api';
import { clock, duration, hm, matchText, money } from '@/lib/format';
import type { CommissionPreview, OrderView, SellableCatalog } from '@/lib/types';
import { cn } from '@/lib/utils';

const COUNTER_METHODS = [
  ['CASH', 'Dinheiro'],
  ['STORE_PIX', 'Pix na loja'],
  ['TERMINAL_DEBIT', 'Maquininha débito'],
  ['TERMINAL_CREDIT', 'Maquininha crédito'],
] as const;

function useElapsed(o: OrderView | undefined) {
  const [s, setS] = useState(0);
  useEffect(() => setS(o?.elapsedSeconds ?? 0), [o?.elapsedSeconds]);
  useEffect(() => {
    if (!o || o.paused || o.status !== 'IN_SERVICE') return;
    const t = setInterval(() => setS((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [o]);
  return s;
}

/** Atendimento em andamento (telas 28 e 28b). */
function ServiceScreen({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const key = ['staff-order', id];
  const { data: o } = useQuery({ queryKey: key, queryFn: () => api.get<OrderView>(`/staff/orders/${id}`), refetchInterval: 20_000 });
  const elapsed = useElapsed(o);
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState(false);
  const [marking, setMarking] = useState<{ id: string; name: string } | null>(null);
  const set = (v: OrderView) => qc.setQueryData(key, v);

  const mark = useMutation({
    mutationFn: (itemId: string) => api.post<OrderView>(`/staff/orders/${id}/items/${itemId}/done`),
    onSuccess: (v) => {
      set(v);
      setMarking(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const pause = useMutation({ mutationFn: (paused: boolean) => api.post<OrderView>(`/staff/orders/${id}/pause`, { paused }), onSuccess: set, onError: (e) => toast.error(errorMessage(e)) });

  useEffect(() => {
    if (o && o.status === 'COMPLETED') router.replace('/barbeiro');
  }, [o, router]);

  if (!o) {
    return (
      <Body className="pt-6">
        <Skeleton className="mb-3 h-20" />
        <Skeleton className="h-40" />
      </Body>
    );
  }

  const est = Math.max(1, o.durationMin * 60);
  const pct = Math.min(100, Math.round((elapsed / est) * 100));
  const left = Math.max(0, Math.ceil((est - elapsed) / 60));
  const services = o.items.filter((i) => i.kind === 'SERVICE');
  const products = o.items.filter((i) => i.kind === 'PRODUCT');
  const firstOpen = services.find((s) => !s.doneAt);
  const pending = services.filter((s) => !s.doneAt);
  const walkIn = o.origin === 'WALK_IN';

  return (
    <>
      <Body>
        <TopNav
          title="Em atendimento"
          back="/barbeiro"
          right={
            <Pulse active={!o.paused}>
              <span className={o.paused ? 'badge n dot' : 'badge warn dot'}>{o.paused ? 'Pausado' : 'Ao vivo'}</span>
            </Pulse>
          }
        />
        <Reveal>
          <section className="card raised mb-[22px] flex items-center gap-3">
            <Avatar data={o.customer.avatar} size={42} />
            <div className="flex-1">
              <div className="b lg">{o.customer.name}</div>
              {walkIn ? (
                <div className="rowx xs mt-1 gap-1.5">
                  <span className="badge n">Avulso</span>
                  <span className="muted">sem código</span>
                </div>
              ) : (
                <div className="code xs mt-[3px]">{o.code}</div>
              )}
            </div>
            <div className="text-right">
              <div className="xs muted">Começou</div>
              <div className="s b">{o.startedAt ? hm(o.startedAt) : '—'}</div>
            </div>
          </section>
          <section className="center pb-[22px] pt-2.5">
            <div className="xs muted mb-1.5">Tempo de cadeira</div>
            <ChromeText as="div" className="num text-[64px] font-extrabold leading-none tracking-[-.02em]">
              {clock(elapsed)}
            </ChromeText>
            <div className="m muted mt-2">
              estimado {duration(o.durationMin)} · {elapsed > est ? `passou ${Math.ceil((elapsed - est) / 60)} min` : `faltam ${left} min`}
            </div>
            <div className="prog mt-4">
              <i style={{ width: `${pct}%` }} />
            </div>
          </section>
          <h2 className="sec mt-0">{walkIn ? 'Pedido avulso' : 'Pacote do cliente'}</h2>
          <div className="stack">
            {services.map((s) => (
              <div key={s.id} className={cn('card flex items-center gap-[11px]', firstOpen?.id === s.id && 'sel')}>
                {s.doneAt ? (
                  <span className="grid h-6 w-6 flex-[0_0_24px] place-items-center rounded-full bg-[#f2f2f2] text-[#0a0a0a]">
                    <Icon name="check" size="s" className="!h-3.5 !w-3.5" />
                  </span>
                ) : (
                  <span className="h-6 w-6 flex-[0_0_24px] rounded-full border-2 border-[#f2f2f2]" />
                )}
                <div className="flex-1">
                  <div className="s b">{s.name}</div>
                  <div className="xs muted mt-0.5">
                    {s.durationMin} min estimados{s.doneAt ? ` · feito às ${hm(s.doneAt)}` : ''}
                    {s.addedDuringService ? ' · extra' : ''}
                  </div>
                </div>
                {!s.doneAt ? (
                  <button type="button" className="btn sm dark" onClick={() => setMarking({ id: s.id, name: s.name })} disabled={mark.isPending}>
                    Marcar
                  </button>
                ) : null}
              </div>
            ))}
            {products.map((p) => (
              <div key={p.id} className="card flex items-center gap-[11px]">
                <span className="grid h-6 w-6 flex-[0_0_24px] place-items-center">
                  <Icon name="bag" size="s" />
                </span>
                <div className="flex-1">
                  <div className="s b">
                    {p.name}
                    {p.quantity > 1 ? ` × ${p.quantity}` : ''}
                  </div>
                  <div className="xs muted mt-0.5">{p.deliveredAt ? 'Produto · entregue' : 'Produto · a balconista entrega'}</div>
                </div>
                <span className="s b num">{money(p.totalCents)}</span>
              </div>
            ))}
          </div>
          <button type="button" className="btn ghost mt-3" onClick={() => setAdding(true)}>
            <Icon name="plus" size="s" />
            Adicionar serviço ou produto
          </button>
          <section className="card raised mt-3.5">
            {walkIn ? (
              <>
                <div className="rowx m mb-2">
                  <span className="muted">Serviços</span>
                  <span className="sp" />
                  <span className="num">{money(services.reduce((s, i) => s + i.totalCents, 0))}</span>
                </div>
                <div className="rowx m mb-2">
                  <span className="muted">Produtos</span>
                  <span className="sp" />
                  <span className="num">{money(products.reduce((s, i) => s + i.totalCents, 0))}</span>
                </div>
                <div className="divider my-2.5" />
                <div className="rowx">
                  <span className="b">A receber no fim</span>
                  <span className="sp" />
                  <span className="price text-[18px]">{money(o.amountDueCents)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="rowx m mb-2">
                  <span className="muted">Total do pedido</span>
                  <span className="sp" />
                  <span className="num">{money(o.totalCents)}</span>
                </div>
                {o.paidCents > 0 ? (
                  <div className="rowx m mb-2">
                    <span className="muted">Pago online · {o.payments.find((p) => p.channel === 'ONLINE')?.methodLabel ?? ''}</span>
                    <span className="sp" />
                    <span className="num">{money(-o.paidCents)}</span>
                  </div>
                ) : null}
                <div className="divider my-2.5" />
                <div className="rowx">
                  <span className="b">{o.paymentChoice === 'CASH' ? 'Em dinheiro no balcão' : 'A pagar no balcão'}</span>
                  <span className="sp" />
                  <span className="price text-[18px]">{money(o.amountDueCents)}</span>
                </div>
              </>
            )}
          </section>
          <Note className="mt-3.5">Só os serviços entram no cronômetro e têm o botão Marcar. Produtos entram no valor do pedido e a balconista entrega.</Note>
          {pending.length ? (
            <p className="xs muted center mt-3" role="status">
              Para concluir, marque {pending.length === 1 ? 'o serviço que falta' : `os ${pending.length} serviços que faltam`}: {pending.map((s) => s.name).join(', ')}.
            </p>
          ) : null}
        </Reveal>
      </Body>
      <Foot className="flex gap-2.5">
        <Button variant="ghost" className="flex-[0_0_34%]" onClick={() => pause.mutate(!o.paused)} loading={pause.isPending}>
          {o.paused ? 'Retomar' : 'Pausar'}
        </Button>
        <Button onClick={() => setClosing(true)} disabled={pending.length > 0} title={pending.length ? 'Marque todos os serviços antes de concluir' : undefined}>
          Concluir
        </Button>
      </Foot>
      <ConfirmDialog
        open={!!marking}
        onOpenChange={(v) => !v && setMarking(null)}
        title="Marcar como feito?"
        description={
          <>
            Você tem certeza que deseja concluir a marcação de <b className="text-[var(--ink)]">{marking?.name}</b>? Depois de marcado, não dá para voltar.
          </>
        }
        confirmLabel="Sim, marcar"
        onConfirm={() => marking && mark.mutate(marking.id)}
        loading={mark.isPending}
      />
      <AddItemsSheet order={o} open={adding} onOpenChange={setAdding} onAdded={set} />
      <CompleteSheet order={o} elapsed={elapsed} open={closing} onOpenChange={setClosing} />
    </>
  );
}

/** Adicionar serviço ou produto (tela 28c). */
function AddItemsSheet({ order, open, onOpenChange, onAdded }: { order: OrderView; open: boolean; onOpenChange: (v: boolean) => void; onAdded: (o: OrderView) => void }) {
  const [tab, setTab] = useState<'s' | 'p'>('s');
  const [svc, setSvc] = useState<string[]>([]);
  const [prd, setPrd] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const { data: catalog } = useQuery({ queryKey: ['staff-catalog'], queryFn: () => api.get<SellableCatalog>('/staff/catalog'), enabled: open });
  const inOrder = new Set(order.items.map((i) => i.serviceId).filter(Boolean));
  const services = (catalog?.services ?? []).filter((s) => !inOrder.has(s.id) && (!order.barber || s.barberIds.includes(order.barber.id)));
  const products = catalog?.products ?? [];

  const add = useMutation({
    mutationFn: () => api.post<OrderView>(`/staff/orders/${order.id}/items`, { serviceIds: svc, productIds: prd }),
    onSuccess: (o) => {
      onAdded(o);
      setSvc([]);
      setPrd([]);
      onOpenChange(false);
      toast.success('Adicionado ao pedido');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const total = services.filter((s) => svc.includes(s.id)).reduce((a, s) => a + s.priceCents, 0) + products.filter((p) => prd.includes(p.id)).reduce((a, p) => a + p.priceCents, 0);
  const mins = services.filter((s) => svc.includes(s.id)).reduce((a, s) => a + s.durationMin, 0);
  const n = svc.length + prd.length;
  const flip = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <div className="rowx mb-3.5">
          <SheetTitle className="disp m-0 text-[20px]">Adicionar ao pedido</SheetTitle>
          <span className="sp" />
          <SheetClose className="ibtn !h-[34px] !w-[34px]" aria-label="Fechar">
            <Icon name="close" size="s" />
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">Escolha serviços e produtos extras</SheetDescription>
        <div className="segs mb-3.5" role="tablist">
          <button type="button" role="tab" className={cn(tab === 's' && 'on')} aria-selected={tab === 's'} onClick={() => setTab('s')}>
            Serviços
          </button>
          <button type="button" role="tab" className={cn(tab === 'p' && 'on')} aria-selected={tab === 'p'} onClick={() => setTab('p')}>
            Produtos
          </button>
        </div>
        <label className="input mb-3">
          <Icon name="search" size="s" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 's' ? 'Buscar serviço…' : 'Buscar produto…'} aria-label="Buscar item" />
        </label>
        <div className="stack max-h-[46vh] overflow-y-auto" role="group" aria-label="Itens">
          {(tab === 's' ? services : products).filter((item) => matchText(item.name, q)).map((item) => {
            const isSvc = tab === 's';
            const on = isSvc ? svc.includes(item.id) : prd.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                className={cn('card flex w-full cursor-pointer items-center gap-3 text-left text-[var(--ink)]', on && 'sel')}
                onClick={() => (isSvc ? flip(svc, setSvc, item.id) : flip(prd, setPrd, item.id))}
              >
                <span className={cn('chk', on && 'on')}>
                  <svg aria-hidden="true">
                    <use href="#check" />
                  </svg>
                </span>
                <span className="flex-1">
                  <span className="s b block">{item.name}</span>
                  <span className="xs muted mt-0.5 block">{'durationMin' in item ? `${item.durationMin} min` : `produto · ${item.detail}`}</span>
                </span>
                <span className="price">{money(item.priceCents)}</span>
              </button>
            );
          })}
          {catalog && (tab === 's' ? services : products).length === 0 ? <p className="xs muted">Nada disponível para adicionar.</p> : null}
        </div>
        <p className="xs muted mb-3.5 mt-3 leading-relaxed">{tab === 's' ? 'Serviços somam no tempo estimado e ganham o botão Marcar.' : 'Produtos só entram no valor. A comissão de produtos vai para você.'}</p>
        <Button disabled={!n} loading={add.isPending} onClick={() => add.mutate()}>
          {n ? `Adicionar ${n} ${n === 1 ? 'item' : 'itens'} · + ${money(total)}${mins ? ` · + ${duration(mins)}` : ''}` : 'Escolha um item'}
        </Button>
      </SheetContent>
    </Sheet>
  );
}

/** Conclusão (telas 29, 29b e 29c). */
function CompleteSheet({ order, elapsed, open, onOpenChange }: { order: OrderView; elapsed: number; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'now' | 'counter'>('now');
  const [method, setMethod] = useState<(typeof COUNTER_METHODS)[number][0]>('CASH');
  const { data } = useQuery({
    queryKey: ['completion', order.id, order.items.length],
    queryFn: () => api.get<{ order: OrderView; commission: CommissionPreview }>(`/staff/orders/${order.id}/completion`),
    enabled: open,
  });
  const walkIn = order.origin === 'WALK_IN';
  const cash = order.paymentChoice === 'CASH';
  const commission = data?.commission;

  const complete = useMutation({
    mutationFn: () =>
      api.post<OrderView>(`/staff/orders/${order.id}/complete`, walkIn ? { payment: mode === 'now' ? { mode, method } : { mode } } : { completionCode: `OK-${code}` }),
    onSuccess: () => {
      toast.success(walkIn ? 'Pedido avulso concluído' : cash ? 'Concluído e marcado como pago' : 'Pedido concluído');
      void qc.invalidateQueries({ queryKey: ['staff-agenda'] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      onOpenChange(false);
      router.replace('/barbeiro');
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setCode('');
    },
  });

  const servicesLabel = order.items.filter((i) => i.kind === 'SERVICE').map((i) => i.name).join(' + ');
  const productsLabel = order.items.filter((i) => i.kind === 'PRODUCT').map((i) => i.name).join(', ');
  const productDue = order.items.filter((i) => i.kind === 'PRODUCT' && i.addedDuringService).reduce((s, i) => s + i.totalCents, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle className="disp mb-2 text-[21px]">{walkIn ? 'Concluir pedido avulso' : 'Código de conclusão'}</SheetTitle>
        <SheetDescription className="m muted mb-5">
          {walkIn ? (
            'Pedido criado por você: não precisa de código de conclusão.'
          ) : cash ? (
            <>
              Este pedido é em <b className="text-[var(--ink)]">dinheiro</b>. Peça o código de conclusão ao cliente: com ele, o pedido passa a Pago na hora.
            </>
          ) : (
            'Peça ao cliente o código de conclusão que apareceu no app dele. Sem ele o pedido continua em atendimento.'
          )}
        </SheetDescription>

        {!walkIn ? <CodePad prefix="OK-" length={4} value={code} onChange={setCode} letters={false} /> : null}

        <section className={cn('card raised mb-4 !bg-[#161616]', !walkIn && 'mt-5')}>
          <div className="rowx m mb-2">
            <span className="muted">Cliente</span>
            <span className="sp" />
            <span>{order.customer.name}</span>
          </div>
          <div className="rowx m mb-2">
            <span className="muted">{walkIn ? 'Serviços' : 'Pacote'}</span>
            <span className="sp" />
            <span className="max-w-[60%] text-right">{walkIn ? servicesLabel : [servicesLabel, productsLabel].filter(Boolean).join(' + ')}</span>
          </div>
          {walkIn && productsLabel ? (
            <div className="rowx m mb-2">
              <span className="muted">Produto</span>
              <span className="sp" />
              <span className="max-w-[60%] text-right">{productsLabel}</span>
            </div>
          ) : null}
          {!walkIn ? (
            <div className="rowx m mb-2">
              <span className="muted">Tempo real</span>
              <span className="sp" />
              <span className="code">{clock(elapsed, true)}</span>
            </div>
          ) : null}
          {cash && !walkIn ? (
            <>
              <div className="rowx m mb-2">
                <span className="muted">Pagamento</span>
                <span className="sp" />
                <span className="badge info dot">Dinheiro · aguardando</span>
              </div>
              <div className="rowx m mb-2">
                <span className="muted">Valor no balcão</span>
                <span className="sp" />
                <span>{money(order.amountDueCents)}</span>
              </div>
            </>
          ) : !walkIn && order.amountDueCents > 0 ? (
            <div className="rowx m mb-2">
              <span className="muted">Saldo no balcão</span>
              <span className="sp" />
              <span>{money(order.amountDueCents)}</span>
            </div>
          ) : null}
          {walkIn ? (
            <>
              <div className="divider my-2.5" />
              <div className="rowx">
                <span className="b">Total</span>
                <span className="sp" />
                <span className="price text-[20px]">{money(order.totalCents)}</span>
              </div>
            </>
          ) : (
            <>
              <div className="divider my-2.5" />
              {commission?.lines.map((l) => (
                <div className="rowx m mb-1.5" key={`${l.kind}${l.rateBps}`}>
                  <span className="muted">{l.label}</span>
                  <span className="sp" />
                  <span className="num">{money(l.amountCents)}</span>
                </div>
              ))}
              <div className="rowx">
                <span className="b">Sua comissão</span>
                <span className="sp" />
                <span className="price text-[18px]">{commission ? money(commission.totalCents) : '—'}</span>
              </div>
            </>
          )}
        </section>

        {walkIn ? (
          <>
            <div className="xs muted mb-2 font-semibold uppercase tracking-[.12em]">Pagamento</div>
            <div className="segs mb-3" role="tablist">
              <button type="button" role="tab" className={cn(mode === 'now' && 'on')} aria-selected={mode === 'now'} onClick={() => setMode('now')}>
                Recebi agora
              </button>
              <button type="button" role="tab" className={cn(mode === 'counter' && 'on')} aria-selected={mode === 'counter'} onClick={() => setMode('counter')}>
                Balcão recebe
              </button>
            </div>
            {mode === 'now' ? (
              <div className="scrollx mb-3" role="radiogroup" aria-label="Forma de pagamento">
                {COUNTER_METHODS.map(([m, label]) => (
                  <button key={m} type="button" role="radio" aria-checked={method === m} className={cn('chip', method === m && 'on')} onClick={() => setMethod(m)}>
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="xs muted mb-3.5 leading-relaxed">
              {mode === 'now' ? 'O pedido fecha como Pago, com o seu nome e a forma de pagamento registrados.' : 'O pedido fecha como Aguardando pagamento e aparece na fila da balconista para ela dar baixa.'}
            </p>
            <div className="rowx m mb-3.5">
              <span className="muted">
                Sua comissão{commission && commission.productCents ? ` · ${money(commission.serviceCents)} + ${money(commission.productCents)} produto` : ''}
              </span>
              <span className="sp" />
              <span className="price">{commission ? money(commission.totalCents) : '—'}</span>
            </div>
          </>
        ) : (
          <p className="xs muted mb-3.5 leading-relaxed">
            {cash
              ? 'Ao confirmar, o pedido muda de Aguardando pagamento para Pago e o cliente acerta com a balconista.'
              : order.amountDueCents > 0
                ? `Os ${money(productDue || order.amountDueCents)} ${productDue ? 'dos produtos' : 'do saldo'} ficam para a balconista receber no balcão.`
                : 'O pedido fecha como concluído e a comissão entra nos seus ganhos.'}
          </p>
        )}

        <Button className="mb-2.5" onClick={() => complete.mutate()} loading={complete.isPending} disabled={!walkIn && code.length < 4}>
          {walkIn ? (mode === 'now' ? 'Concluir e registrar pagamento' : 'Concluir e enviar ao balcão') : cash ? 'Concluir e marcar como pago' : 'Concluir pedido'}
        </Button>
        <SheetClose asChild>
          <Button variant="ghost">Voltar ao atendimento</Button>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}

export default function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Screen>
      <ServiceScreen id={id} />
    </Screen>
  );
}
