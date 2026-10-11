'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { AdminHeader, SelectFilter } from '@/components/admin/shell';
import { Avatar } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { Reveal } from '@/components/motion/motion';
import { Skeleton } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { addDaysKey, cap, dateKey, duration, longDate, money } from '@/lib/format';
import type { Avatar as AvatarData } from '@/lib/types';
import { cn } from '@/lib/utils';
import { DateInput } from '@/components/ui/date-input';

interface AgendaEvent {
  orderId: string;
  code: string;
  customerName: string;
  itemsLabel: string;
  startMin: number;
  endMin: number;
  start: string;
  end: string;
  state: 'now' | 'late' | 'done' | 'no_show' | 'pending' | 'scheduled';
  lateMinutes: number | null;
  fitInAt: string | null;
  fitInMin: number | null;
  origin: 'SITE' | 'WALK_IN';
  displayLabel: string;
  customerPhone: string | null;
  scheduled: string | null;
  durationMin: number;
  services: { name: string; done: boolean }[];
  products: string[];
  totalCents: number;
  paidCents: number;
  amountDueCents: number;
  paymentChoiceLabel: string | null;
}

interface Agenda {
  date: string;
  openMin: number | null;
  closeMin: number | null;
  breakStart: string | null;
  breakEnd: string | null;
  nowMinutes: number | null;
  barbers: { id: string; name: string; firstName: string; avatar: AvatarData; events: AgendaEvent[] }[];
}

const PX_PER_MIN = 1.5;
const HOUR_PX = 60 * PX_PER_MIN;

/** Agenda da casa (tela 41): uma coluna por profissional, na escala do dia. */
export default function HouseAgendaPage() {
  const [date, setDate] = useState(dateKey());
  const [barberId, setBarberId] = useState('');
  const { data: a, isLoading } = useQuery({
    queryKey: ['admin-agenda', date, barberId],
    queryFn: () => api.get<Agenda>('/admin/agenda', { date, barberId: barberId || undefined }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const { data: barbers } = useQuery({ queryKey: ['catalog-barbers'], queryFn: () => api.get<{ id: string; name: string }[]>('/catalog/barbers') });

  const events = a?.barbers.flatMap((b) => b.events) ?? [];
  // A escala começa e termina em hora cheia, então as linhas e os rótulos batem com os blocos.
  const start = Math.floor(Math.min(a?.openMin ?? 9 * 60, ...events.map((e) => e.startMin)) / 60) * 60;
  const end = Math.ceil(Math.max(a?.closeMin ?? 20 * 60, ...events.map((e) => e.endMin), ...events.map((e) => (e.fitInMin ?? 0) + 30)) / 60) * 60;
  const hours: number[] = [];
  for (let h = start; h <= end; h += 60) hours.push(h);
  const y = (min: number) => (min - start) * PX_PER_MIN;
  const grid = `repeating-linear-gradient(180deg, #262626 0 1px, transparent 1px ${HOUR_PX / 2}px, #181818 ${HOUR_PX / 2}px ${HOUR_PX / 2 + 1}px, transparent ${HOUR_PX / 2 + 1}px ${HOUR_PX}px)`;

  return (
    <>
      <AdminHeader url="/agenda" title="Agenda">
        <span className="fsel">
          <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-[var(--ink)]" onClick={() => setDate(addDaysKey(date, -1))} aria-label="Dia anterior">
            <Icon name="back" size="s" />
          </button>
          <DateInput bare value={date} onChange={setDate} aria-label="Dia" />
          <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-[var(--ink)]" onClick={() => setDate(addDaysKey(date, 1))} aria-label="Próximo dia">
            <Icon name="chev" size="s" />
          </button>
        </span>
        <button type="button" className="btn sm dark" onClick={() => setDate(dateKey())}>
          Hoje
        </button>
      </AdminHeader>
      <main className="acontent">
        <div className="filters">
          <SelectFilter label="Profissional" value={barberId} onChange={setBarberId} options={[{ value: '', label: 'Todos' }, ...(barbers ?? []).map((b) => ({ value: b.id, label: b.name }))]} />
          <span className="s b">{cap(longDate(date))}</span>
          {a && a.openMin === null ? <span className="badge n">Casa fechada neste dia</span> : null}
          <span className="sp" />
          <span className="lgnd m-0">
            <i style={{ background: '#1e1e1e', border: '1px solid #9a9a9a' }} />
            agendado
          </span>
          <span className="lgnd m-0 ml-3">
            <i style={{ border: '2px solid #f2f2f2' }} />
            na cadeira
          </span>
          <span className="lgnd m-0 ml-3">
            <i style={{ background: 'repeating-linear-gradient(135deg, #5a5a5a 0 2px, #1a1a1a 2px 4px)', border: '1px solid #f2f2f2' }} />
            atrasado / encaixe
          </span>
        </div>
        {isLoading || !a ? (
          <Skeleton className="h-[600px]" />
        ) : (
          <Tooltip.Provider delayDuration={180} skipDelayDuration={80}>
          <Reveal className="tbl pt-2" deps={[date, barberId]}>
            <div className="grid gap-2" style={{ gridTemplateColumns: `56px repeat(${a.barbers.length || 1}, minmax(160px, 1fr))`, minWidth: 56 + a.barbers.length * 168 }}>
              <div />
              {a.barbers.map((b) => (
                <div key={b.id} className="card rowx justify-center gap-2 !p-[9px]">
                  <Avatar data={b.avatar} size={26} />
                  <span className="s b">{b.firstName}</span>
                  <span className="xs muted">{b.events.filter((e) => e.state !== 'no_show').length}</span>
                </div>
              ))}
              <div className="relative" style={{ height: y(end) }}>
                {hours.map((h) => (
                  <div key={h} className="tlabel absolute right-1 leading-none" style={{ top: y(h), transform: 'translateY(-50%)' }}>
                    {String(h / 60).padStart(2, '0')}:00
                  </div>
                ))}
              </div>
              {a.barbers.map((b) => (
                <div key={b.id} className="relative" style={{ height: y(end) + 1, background: grid }}>
                  {a.breakStart && a.breakEnd ? (
                    <div
                      className="xs absolute inset-x-0 grid place-items-center rounded-[4px] border border-dashed border-[#2e2e2e] text-[#5a5a5a]"
                      style={{ top: y(Number(a.breakStart.slice(0, 2)) * 60 + Number(a.breakStart.slice(3))), height: (Number(a.breakEnd.slice(0, 2)) * 60 + Number(a.breakEnd.slice(3)) - (Number(a.breakStart.slice(0, 2)) * 60 + Number(a.breakStart.slice(3)))) * PX_PER_MIN }}
                    >
                      intervalo
                    </div>
                  ) : null}
                  {b.events.map((e) => (
                    <div key={e.orderId} className="contents">
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <Link
                            href={`/admin/pedidos/${e.code}`}
                            className={cn('ev absolute inset-x-[2px] !min-h-0 !py-[5px] hover:z-[3] hover:border-[#f2f2f2]', e.state === 'now' && 'now', e.state === 'late' && 'warn', (e.state === 'done' || e.state === 'no_show') && 'done')}
                            style={{ top: y(e.startMin) + 1, height: Math.max(22, (e.endMin - e.startMin) * PX_PER_MIN - 2) }}
                          >
                            <span className="truncate !text-[12.5px] !font-bold !text-[var(--ink)]">{e.customerName}</span>
                            <span className="truncate">
                              {e.itemsLabel} · {e.state === 'late' ? `atrasada ${e.lateMinutes} min` : `${e.start}–${e.end}`}
                              {e.origin === 'WALK_IN' ? ' · avulso' : ''}
                              {e.state === 'no_show' ? ' · falta' : ''}
                            </span>
                          </Link>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content side="right" align="start" sideOffset={8} collisionPadding={12} className="z-[60] w-[270px] rounded-[6px] border border-[var(--line-strong)] bg-[#141414] p-3.5 text-[var(--ink)] shadow-[0_12px_40px_rgba(0,0,0,.6)] data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0">
                            <EventCard e={e} />
                            <Tooltip.Arrow className="fill-[#141414]" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                      {e.state === 'late' && e.fitInMin !== null ? (
                        <Link href={`/admin/pedidos/${e.code}`} className="ev warn absolute inset-x-0 !min-h-0 border-dashed" style={{ top: y(e.fitInMin), height: 44 }}>
                          Encaixe sugerido
                          <span>
                            {e.customerName} · {e.fitInAt}
                          </span>
                        </Link>
                      ) : null}
                    </div>
                  ))}
                  {a.nowMinutes !== null && a.nowMinutes >= start && a.nowMinutes <= end ? <div className="pointer-events-none absolute inset-x-0 z-[2] h-0.5 bg-[#f2f2f2]" style={{ top: y(a.nowMinutes) }} /> : null}
                </div>
              ))}
            </div>
            {!a.barbers.length ? <p className="xs muted center py-8">Nenhum profissional ativo.</p> : null}
          </Reveal>
          </Tooltip.Provider>
        )}
      </main>
    </>
  );
}

/** Resumo do pedido no cartão de hover da agenda. */
function EventCard({ e }: { e: AgendaEvent }) {
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="rowx xs gap-2 py-[3px]">
      <span className="muted">{label}</span>
      <span className="sp" />
      <span className="b text-right">{children}</span>
    </div>
  );
  return (
    <div>
      <div className="rowx mb-1 gap-2">
        <span className="s b truncate">{e.customerName}</span>
        <span className="sp" />
        <span className="badge n shrink-0">{e.state === 'no_show' ? 'Falta' : e.displayLabel}</span>
      </div>
      <div className="xs muted mb-2.5">
        {e.origin === 'WALK_IN' ? 'Avulso' : <span className="code">{e.code}</span>}
        {e.customerPhone ? ` · ${e.customerPhone}` : ''}
      </div>
      <div className="mb-2 border-t border-[var(--line)] pt-2">
        {e.services.map((s) => (
          <div key={s.name} className="rowx xs gap-2 py-[2px]">
            <span className={cn('grid h-3.5 w-3.5 flex-[0_0_14px] place-items-center rounded-full border', s.done ? 'border-[#f2f2f2] bg-[#f2f2f2] text-[#0a0a0a]' : 'border-[#6a6a6a]')}>
              {s.done ? <Icon name="check" size="s" className="!h-2.5 !w-2.5" /> : null}
            </span>
            <span>{s.name}</span>
          </div>
        ))}
        {e.products.map((p) => (
          <div key={p} className="rowx xs muted gap-2 py-[2px]">
            <Icon name="bag" size="s" className="!h-3.5 !w-3.5" />
            <span>{p}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--line)] pt-1.5">
        <Row label={e.state === 'now' || e.state === 'done' ? 'Na cadeira' : 'Horário'}>
          {e.start}–{e.end}
        </Row>
        {e.scheduled && e.scheduled !== `${e.start}–${e.end}` ? <Row label="Agendado">{e.scheduled}</Row> : null}
        <Row label="Duração prevista">{duration(e.durationMin)}</Row>
        {e.state === 'late' ? <Row label="Atraso">{e.lateMinutes} min{e.fitInAt ? ` · encaixe ${e.fitInAt}` : ''}</Row> : null}
        <Row label="Total">{money(e.totalCents)}</Row>
        {e.paidCents > 0 ? <Row label="Pago">{money(e.paidCents)}</Row> : null}
        {e.amountDueCents > 0 ? <Row label={e.paymentChoiceLabel ? `A receber · ${e.paymentChoiceLabel.toLowerCase()}` : 'A receber'}>{money(e.amountDueCents)}</Row> : null}
      </div>
      <div className="xs muted mt-2">Clique para abrir o pedido</div>
    </div>
  );
}
