'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Avatar } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { BarberTabBar, Body, Screen } from '@/components/client/shell';
import { CountUp, Reveal } from '@/components/motion/motion';
import { Skeleton } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { cap, duration, hm, longDate, money } from '@/lib/format';
import { useNotifications } from '@/lib/queries';
import { useMe } from '@/lib/session';
import type { OrderView, StaffAgenda } from '@/lib/types';

function badgeFor(o: OrderView): { cls: string; label: string } {
  if (o.displayStatus === 'LATE') return { cls: 'badge warn', label: 'Atrasada' };
  if (o.origin === 'WALK_IN') return { cls: 'badge n', label: 'Avulso' };
  if (o.paymentChoice === 'CASH' && o.amountDueCents > 0) return { cls: 'badge info', label: 'Dinheiro' };
  if (o.displayStatus === 'IN_SERVICE') return { cls: 'badge warn', label: 'Na cadeira' };
  return { cls: 'badge ok', label: 'Pago' };
}

function ServicesLabel({ o }: { o: OrderView }) {
  const services = o.items.filter((i) => i.kind === 'SERVICE').map((i) => i.name);
  return <>{services.join(' + ')}</>;
}

export default function AgendaPage() {
  const { data: me } = useMe();
  const { data: a } = useQuery({ queryKey: ['staff-agenda'], queryFn: () => api.get<StaffAgenda>('/staff/agenda'), refetchInterval: 30_000 });
  const { data: notes } = useNotifications();
  const current = a?.current;
  const inService = current?.status === 'IN_SERVICE';

  return (
    <Screen>
      <Body>
        <div className="topnav">
          {me ? <Avatar data={me.avatar} size={38} /> : null}
          <div className="flex-1">
            <div className="s b">{me?.name}</div>
            <div className="xs muted">{a ? cap(longDate(a.date)) : ''}</div>
          </div>
          <Link className="ibtn" href="/barbeiro/avisos" aria-label={notes?.unread ? 'Avisos, novos' : 'Avisos'}>
            <Icon name="bell" />
            {notes?.unread ? <span className="dot-n !-right-0.5 !-top-0.5 !h-2.5 !min-w-2.5 !p-0" /> : null}
          </Link>
        </div>

        {!a ? (
          <div className="stack">
            <Skeleton className="h-20" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <Reveal>
            <div className="g3 mb-[18px]">
              <div className="kpi">
                <div className="lab">Hoje</div>
                <div className="val">
                  <CountUp value={a.kpis.total} format={String} />
                </div>
                <div className="dl nt">{a.kpis.done} já feitos</div>
              </div>
              <div className="kpi">
                <div className="lab">Cadeira</div>
                <div className="val">{duration(a.kpis.chairMinutes).replace(' min', 'min')}</div>
                <div className="dl nt">ocupação {a.kpis.occupancyPct}%</div>
              </div>
              <div className="kpi">
                <div className="lab">A receber</div>
                <div className="val">
                  <CountUp value={a.kpis.earningsCents} format={(n) => money(n)} />
                </div>
                {a.kpis.earningsDeltaPct !== null ? <div className={`dl ${a.kpis.earningsDeltaPct < 0 ? 'dn' : ''}`}>{a.kpis.earningsDeltaPct > 0 ? '+' : ''}{a.kpis.earningsDeltaPct}%</div> : <div className="dl nt">comissão prevista</div>}
              </div>
            </div>
            <Link className="btn ghost mb-[18px]" href="/barbeiro/avulso">
              <Icon name="plus" size="s" />
              Novo pedido avulso
            </Link>

            {current ? (
              <section className="card hero mb-1">
                <div className="rowx mb-2.5">
                  <span className="badge dot" style={{ background: '#0a0a0a', color: '#f2f2f2' }}>
                    {inService ? 'Na cadeira' : 'Agora'}
                  </span>
                  <span className="sp" />
                  <span className="xs b num">
                    {hm(current.scheduledStart!)} – {hm(current.scheduledEnd!)}
                  </span>
                </div>
                <div className="rowx mb-3.5">
                  <Avatar data={current.customer.avatar} size={44} ring="#0a0a0a" />
                  <div>
                    <div className="b lg">{current.customer.name}</div>
                    <div className="xs muted mt-0.5">
                      <ServicesLabel o={current} />
                      {current.origin === 'WALK_IN' ? ' · avulso' : ''}
                    </div>
                  </div>
                </div>
                {inService ? (
                  <Link className="btn !border-[#0a0a0a] !bg-[#0a0a0a] !text-[#f2f2f2]" href={`/barbeiro/atendimento/${current.id}`}>
                    <Icon name="clock" size="s" />
                    Abrir atendimento
                  </Link>
                ) : current.origin === 'WALK_IN' ? (
                  <Link className="btn !border-[#0a0a0a] !bg-[#0a0a0a] !text-[#f2f2f2]" href={`/barbeiro/conferir?pedido=${current.id}`}>
                    <Icon name="play" size="s" />
                    Iniciar avulso
                  </Link>
                ) : (
                  <Link className="btn !border-[#0a0a0a] !bg-[#0a0a0a] !text-[#f2f2f2]" href="/barbeiro/conferir">
                    <Icon name="calok" size="s" />
                    Conferir código e iniciar
                  </Link>
                )}
              </section>
            ) : (
              <div className="card note center mb-1 py-6">
                <div className="s b">Nenhum atendimento agora</div>
                <p className="xs muted mt-1">Use o pedido avulso para quem chegar sem horário.</p>
              </div>
            )}

            <div className="sec-row">
              <h2 className="sec">Na sequência</h2>
              <span className="more no-underline">{a.upcoming.length} restantes</span>
            </div>
            <div className="stack">
              {a.upcoming.map((o) => {
                const b = badgeFor(o);
                return (
                  <Link key={o.id} href={o.origin === 'WALK_IN' ? `/barbeiro/conferir?pedido=${o.id}` : '/barbeiro/conferir'} className="card flex items-center gap-[11px]" style={o.displayStatus === 'LATE' ? { borderColor: '#9a9a9a' } : undefined}>
                    <div className="center flex-[0_0_48px]">
                      <div className="code s">{hm(o.scheduledStart!)}</div>
                      <div className="xs muted">{duration(o.durationMin).replace(' ', '')}</div>
                    </div>
                    <span className="w-px self-stretch bg-[#3a3a3a]" />
                    <div className="flex-1">
                      <div className="s b">{o.customer.name}</div>
                      <div className="xs muted mt-0.5">
                        <ServicesLabel o={o} />
                        {o.paymentChoice === 'CASH' ? ' · paga no balcão' : ''}
                      </div>
                    </div>
                    <span className={b.cls}>{b.label}</span>
                  </Link>
                );
              })}
              {a.gaps.map((g) => (
                <div key={g.time} className="card note flex items-center gap-[11px]">
                  <div className="center flex-[0_0_48px]">
                    <div className="code s muted">{g.time}</div>
                    <div className="xs muted">{g.minutes}min</div>
                  </div>
                  <span className="w-px self-stretch bg-[#3a3a3a]" />
                  <div className="flex-1">
                    <div className="s b muted">Horário livre</div>
                    <div className="xs muted mt-0.5">disponível para encaixe</div>
                  </div>
                </div>
              ))}
              {!a.upcoming.length && !a.gaps.length ? <p className="xs muted">Sem mais atendimentos hoje.</p> : null}
            </div>

            {a.completed.length ? (
              <>
                <h2 className="sec">Concluídos hoje</h2>
                <div className="stack">
                  {a.completed.map((o) => (
                    <div key={o.id} className="card flex items-center gap-[11px] opacity-75">
                      <div className="center flex-[0_0_48px]">
                        <div className="code s">{hm(o.scheduledStart!)}</div>
                      </div>
                      <span className="w-px self-stretch bg-[#3a3a3a]" />
                      <div className="flex-1">
                        <div className="s b">{o.customer.name}</div>
                        <div className="xs muted mt-0.5">
                          <ServicesLabel o={o} />
                        </div>
                      </div>
                      <span className={o.amountDueCents > 0 ? 'badge info' : 'badge n'}>{o.amountDueCents > 0 ? 'Balcão' : 'Concluído'}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </Reveal>
        )}
      </Body>
      <BarberTabBar />
    </Screen>
  );
}
