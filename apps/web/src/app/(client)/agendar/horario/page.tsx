'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { Note } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { RequireAuth } from '@/components/client/auth-guard';
import { Body, Foot, Screen, TopNav } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { cap, longDate } from '@/lib/format';
import { useCart } from '@/lib/queries';
import type { SlotsView } from '@/lib/types';
import { cn } from '@/lib/utils';

function TimePicker() {
  const params = useSearchParams();
  const date = params.get('data') ?? '';
  const { data: cart } = useCart();
  const serviceIds = useMemo(() => (cart?.items ?? []).filter((i) => i.kind === 'SERVICE').map((i) => i.refId), [cart]);
  const [selected, setSelected] = useState<string | null>(cart?.schedule?.date === date ? cart.schedule.time : null);

  const { data, isLoading } = useQuery({
    queryKey: ['slots', date, serviceIds],
    queryFn: () => api.get<SlotsView>('/availability/slots', { date, services: serviceIds }),
    enabled: !!date && serviceIds.length > 0,
  });

  const groups = [
    { label: 'Manhã', slots: (data?.slots ?? []).filter((s) => s.time < '12:00') },
    { label: 'Tarde', slots: (data?.slots ?? []).filter((s) => s.time >= '12:00' && s.time < '18:00') },
    { label: 'Noite', slots: (data?.slots ?? []).filter((s) => s.time >= '18:00') },
  ].filter((g) => g.slots.length);
  const chosen = data?.slots.find((s) => s.time === selected);

  return (
    <>
      <Body>
        <TopNav title="Que horas?" back step="Passo 2 de 3" />
        <div className="card raised mb-1 flex items-center gap-2.5 !px-[13px] !py-[11px]">
          <Icon name="cal" />
          <span className="s b">{date ? cap(longDate(date)) : '—'}</span>
          <span className="sp" />
          <Link className="xs lnk" href="/agendar/dia">
            trocar
          </Link>
        </div>
        {isLoading ? (
          <div className="g3 mt-5">
            {Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : (
          <Reveal deps={[date, data?.slots.length]}>
            {groups.map((g) => (
              <div key={g.label}>
                <h2 className="sec mb-2.5 mt-5">{g.label}</h2>
                <div className="g3">
                  {g.slots.map((s) => (
                    <button
                      key={s.time}
                      type="button"
                      className={cn('slot', selected === s.time ? 'sel' : !s.available && 'off')}
                      aria-pressed={selected === s.time}
                      aria-label={`${s.time}${s.available ? '' : ', sem profissional livre'}`}
                      disabled={!s.available}
                      onClick={() => setSelected(s.time)}
                    >
                      {s.time}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!groups.length ? <p className="m muted mt-6">Nenhum horário livre nesse dia. Escolha outra data.</p> : null}
          </Reveal>
        )}
        {chosen ? (
          <Note className="mt-5">
            Às {chosen.time} o atendimento vai até {chosen.endTime}. Chegue 10 minutos antes com o código do pedido em mãos.
          </Note>
        ) : null}
      </Body>
      <Foot>
        {selected ? (
          <Button asChild>
            <Link href={`/agendar/profissional?data=${date}&hora=${selected}`}>Escolher profissional</Link>
          </Button>
        ) : (
          <Button disabled>Escolha um horário</Button>
        )}
      </Foot>
    </>
  );
}

export default function TimePage() {
  return (
    <Screen>
      <Suspense>
        <RequireAuth>{() => <TimePicker />}</RequireAuth>
      </Suspense>
    </Screen>
  );
}
