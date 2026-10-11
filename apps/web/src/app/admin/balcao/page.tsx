'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { DeliverDialog, PaymentDialog, WalkInDialog } from '@/components/admin/counter-dialogs';
import { AdminHeader, Kpi, SearchBox } from '@/components/admin/shell';
import { Empty } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { CountUp, Reveal } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { hm, money, money2 } from '@/lib/format';
import type { CounterToday, OrderView } from '@/lib/types';

function situation(o: OrderView): { cls: string; label: string } {
  if (o.status === 'IN_SERVICE') return { cls: 'badge warn dot', label: 'Na cadeira' };
  if (o.status === 'COMPLETED') return { cls: 'badge info dot', label: 'Concluído' };
  if (o.displayStatus === 'LATE') return { cls: 'badge warn dot', label: 'Atrasado' };
  if (o.scheduledStart) return { cls: 'badge n dot', label: hm(o.scheduledStart) };
  return { cls: 'badge n dot', label: 'Retirada' };
}

function whenLabel(o: OrderView): string {
  if (o.type === 'PICKUP') return `retirada · ${o.amountDueCents ? 'paga no balcão' : `pago no ${o.payments[0]?.methodLabel ?? 'site'}`}`;
  if (o.status === 'IN_SERVICE') return 'na cadeira agora';
  if (o.status === 'COMPLETED') return 'atendimento concluído';
  return o.scheduledStart ? `no atendimento das ${hm(o.scheduledStart)}` : '';
}

/** Balcão — pedidos de hoje (tela 50). */
export default function CounterPage() {
  const [q, setQ] = useState('');
  const search = useDeferredValue(q);
  const { data, isLoading } = useQuery({ queryKey: ['counter', search], queryFn: () => api.get<CounterToday>('/counter/today', { q: search || undefined }), refetchInterval: 20_000 });
  const [paying, setPaying] = useState<OrderView | null>(null);
  const [delivering, setDelivering] = useState<OrderView | null>(null);
  const [walkIn, setWalkIn] = useState(false);

  return (
    <>
      <AdminHeader url="/balcao" title="Pedidos de hoje">
        <SearchBox value={q} onChange={setQ} placeholder="Buscar código, cliente…" width={150} />
        <Button size="sm" onClick={() => setWalkIn(true)}>
          <Icon name="plus" size="s" />
          Novo pedido avulso
        </Button>
      </AdminHeader>
      <main className="acontent">
        {isLoading || !data ? (
          <div className="kpis">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[90px]" />
            ))}
          </div>
        ) : (
          <Reveal>
            <div className="kpis">
              <Kpi label="A receber no balcão" value={<CountUp value={data.kpis.toReceiveCents} format={(n) => money(n)} />} delta={`${data.kpis.toReceiveCount} pedidos`} />
              <Kpi label="Recebido hoje" value={<CountUp value={data.kpis.receivedTodayCents} format={(n) => money(n)} />} delta={`${money(data.kpis.receivedCashCents)} em dinheiro`} />
              <Kpi label="Produtos a entregar" value={data.kpis.toDeliverCount} delta={`${data.kpis.pickupCount} ${data.kpis.pickupCount === 1 ? 'retirada' : 'retiradas'}`} />
              <Kpi label="Pedidos hoje" value={data.kpis.ordersToday} delta={`+${data.kpis.walkInsToday} avulsos`} tone="up" />
            </div>
            <section className="card mb-3.5">
              <div className="rowx mb-3.5">
                <h2 className="s b m-0">A receber no balcão</h2>
                <span className="sp" />
                <span className="xs muted">dinheiro, saldo de extras e avulsos</span>
              </div>
              {data.toReceive.length ? (
                <div className="tbl">
                  <table className="t min-w-[760px]">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Cliente</th>
                        <th>Motivo</th>
                        <th>Profissional</th>
                        <th>Situação</th>
                        <th className="r">Valor</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.toReceive.map((o) => {
                        const s = situation(o);
                        return (
                          <tr key={o.id}>
                            <td className="code">
                              <Link href={`/admin/pedidos/${o.code}`}>{o.code}</Link>
                            </td>
                            <td className="b">{o.customer.name}</td>
                            <td>{o.reason}</td>
                            <td>{o.barber?.name ?? '—'}</td>
                            <td>
                              <span className={s.cls}>{s.label}</span>
                            </td>
                            <td className="r b">{money2(o.amountDueCents)}</td>
                            <td className="r">
                              <button type="button" className="btn sm dark" onClick={() => setPaying(o)}>
                                Dar baixa
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon="money" title="Nada a receber agora" />
              )}
            </section>
            <section className="card mb-3.5">
              <div className="rowx mb-3.5">
                <h2 className="s b m-0">Produtos para entregar</h2>
                <span className="sp" />
                <span className="xs muted">confirme digitando o código do pedido</span>
              </div>
              {data.toDeliver.length ? (
                <div className="tbl">
                  <table className="t min-w-[640px]">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Cliente</th>
                        <th>Produtos</th>
                        <th>Quando</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.toDeliver.map((o) => (
                        <tr key={o.id}>
                          <td className="code">{o.code}</td>
                          <td className="b">{o.customer.name}</td>
                          <td>
                            {o.items
                              .filter((i) => i.kind === 'PRODUCT' && !i.deliveredAt)
                              .map((i) => i.name + (i.quantity > 1 ? ` × ${i.quantity}` : ''))
                              .join(', ')}
                          </td>
                          <td className="muted">{whenLabel(o)}</td>
                          <td className="r">
                            {o.type === 'PICKUP' && o.amountDueCents > 0 ? (
                              <button type="button" className="btn sm dark" onClick={() => setPaying(o)}>
                                Receber e entregar
                              </button>
                            ) : (
                              <button type="button" className="btn sm dark" onClick={() => setDelivering(o)}>
                                Entregar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty icon="bag" title="Nenhum produto pendente" />
              )}
            </section>
            <section className="card">
              <div className="rowx mb-3">
                <h2 className="s b m-0">Fechamento do caixa</h2>
                <span className="sp" />
                <span className="xs muted">o que entrou hoje, por forma de pagamento</span>
              </div>
              <div className="kpis !mb-0" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                <Kpi label="Dinheiro" value={money(data.cash.byMethod.CASH ?? 0)} />
                <Kpi label="Pix na loja" value={money(data.cash.byMethod.STORE_PIX ?? 0)} />
                <Kpi label="Maquininha débito" value={money(data.cash.byMethod.TERMINAL_DEBIT ?? 0)} />
                <Kpi label="Maquininha crédito" value={money(data.cash.byMethod.TERMINAL_CREDIT ?? 0)} />
                <Kpi label="Online (Stripe)" value={money(data.cash.online)} />
              </div>
            </section>
          </Reveal>
        )}
      </main>
      <PaymentDialog order={paying} open={!!paying} onOpenChange={(v) => !v && setPaying(null)} />
      <DeliverDialog order={delivering} open={!!delivering} onOpenChange={(v) => !v && setDelivering(null)} />
      <WalkInDialog open={walkIn} onOpenChange={setWalkIn} />
    </>
  );
}
