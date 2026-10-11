'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/brand/icon';
import { RequireAuth } from '@/components/client/auth-guard';
import { Body, Foot, Screen, TopNav } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { dateKey, duration, monthTitle, weekdayName } from '@/lib/format';
import { useCart } from '@/lib/queries';
import type { CalendarView } from '@/lib/types';
import { cn } from '@/lib/utils';

const STATUS_LABEL = { available: 'tem vaga', full: 'lotado', closed: 'fechado', past: 'passou', beyond: 'fora do prazo' } as const;

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function DayPicker() {
  const router = useRouter();
  const { data: cart } = useCart();
  const today = dateKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(cart?.schedule?.date ?? null);
  const serviceIds = useMemo(() => (cart?.items ?? []).filter((i) => i.kind === 'SERVICE').map((i) => i.refId), [cart]);

  const { data: cal, isLoading } = useQuery({
    queryKey: ['calendar', month, serviceIds],
    queryFn: () => api.get<CalendarView>('/availability/calendar', { month, services: serviceIds }),
    enabled: serviceIds.length > 0,
  });

  // Primeiro dia com vaga já vem escolhido.
  useEffect(() => {
    if (!cal || selected) return;
    const first = cal.days.find((d) => d.status === 'available');
    if (first) setSelected(first.date);
  }, [cal, selected]);

  useEffect(() => {
    if (cart && serviceIds.length === 0) router.replace('/catalogo');
  }, [cart, serviceIds.length, router]);

  const names = cart?.items.filter((i) => i.kind === 'SERVICE').map((i) => i.name.split(' ')[0]) ?? [];
  const firstWeekday = cal ? cal.days[0]!.weekday : 0;
  const maxMonth = shiftMonth(today.slice(0, 7), 2);

  return (
    <>
      <Body>
        <TopNav title="Quando?" back step="Passo 1 de 3" />
        <Reveal>
          <div className="card raised mb-[18px] flex items-center gap-2.5 !px-[13px] !py-[11px]">
            <Icon name="clock" />
            <p className="xs">
              <span className="muted">Precisamos de</span> <b>{duration(cart?.durationMin ?? 0)}</b> <span className="muted">livres para {names.join(' + ') || 'o pacote'}</span>
            </p>
          </div>
          <div className="rowx mb-3.5">
            <h2 className="b lg m-0">{monthTitle(`${month}-01`)}</h2>
            <span className="sp" />
            <button type="button" className="ibtn !h-[34px] !w-[34px]" aria-label="Mês anterior" disabled={month <= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, -1))}>
              <Icon name="back" size="s" />
            </button>
            <button type="button" className="ibtn !h-[34px] !w-[34px]" aria-label="Próximo mês" disabled={month >= maxMonth} onClick={() => setMonth(shiftMonth(month, 1))}>
              <Icon name="chev" size="s" />
            </button>
          </div>
          <div className="mb-[7px] grid grid-cols-7 gap-[7px] text-center">
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
              <span key={i} className="xs muted">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-[7px]">
            {isLoading || !cal
              ? Array.from({ length: 35 }, (_, i) => <Skeleton key={i} className="h-[42px]" />)
              : (
                  <>
                    {Array.from({ length: firstWeekday }, (_, i) => (
                      <span key={`b${i}`} className="cell blank" aria-hidden="true" />
                    ))}
                    {cal.days.map((d) => {
                      const day = Number(d.date.slice(8));
                      const sel = selected === d.date;
                      const can = d.status === 'available';
                      return (
                        <button
                          key={d.date}
                          type="button"
                          className={cn('cell', sel ? 'sel' : d.status === 'full' ? 'full' : !can ? 'off' : '')}
                          aria-pressed={sel}
                          aria-label={`${day}, ${weekdayName(d.weekday)}, ${STATUS_LABEL[d.status]}`}
                          disabled={!can}
                          onClick={() => setSelected(d.date)}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </>
                )}
          </div>
          <div className="rowx xs muted mt-[18px] flex-wrap gap-4">
            <span className="rowx gap-1.5">
              <i className="block h-[11px] w-[11px] rounded-[2px] bg-[#f2f2f2]" />
              escolhido
            </span>
            <span className="rowx gap-1.5">
              <i className="block h-[11px] w-[11px] rounded-[2px] border border-[#3a3a3a] bg-[#161616]" />
              tem vaga
            </span>
            <span className="rowx gap-1.5">
              <i className="block h-[11px] w-[11px] rounded-[2px]" style={{ background: 'repeating-linear-gradient(135deg, #5a5a5a 0 2px, #141414 2px 4px)' }} />
              lotado
            </span>
            <span className="rowx gap-1.5">
              <i className="block h-[11px] w-[11px] rounded-[2px] border border-dashed border-[#5a5a5a]" />
              fechado
            </span>
          </div>
          {cal && !cal.days.some((d) => d.status === 'available') ? (
            <p className="xs muted mt-4">Nenhum dia com vaga neste mês para esse pacote. Veja o próximo mês ou tire algum serviço.</p>
          ) : null}
        </Reveal>
      </Body>
      <Foot>
        {selected ? (
          <Button asChild>
            <Link href={`/agendar/horario?data=${selected}`}>
              Ver horários de {weekdayName(new Date(`${selected}T12:00:00Z`).getUTCDay())}, {Number(selected.slice(8))}
            </Link>
          </Button>
        ) : (
          <Button disabled>Escolha um dia</Button>
        )}
      </Foot>
    </>
  );
}

export default function DayPage() {
  return (
    <Screen>
      <RequireAuth>{() => <DayPicker />}</RequireAuth>
    </Screen>
  );
}

