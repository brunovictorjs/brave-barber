'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, RatingBadge } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { RequireAuth } from '@/components/client/auth-guard';
import { Body, Foot, Screen, TopNav } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { cap, longDate } from '@/lib/format';
import { PREFERRED_BARBER_KEY } from '@/lib/booking';
import { useCart, useCartActions } from '@/lib/queries';
import type { BarbersAtView } from '@/lib/types';
import { cn } from '@/lib/utils';

function BarberPicker() {
  const router = useRouter();
  const params = useSearchParams();
  const date = params.get('data') ?? '';
  const time = params.get('hora') ?? '';
  const { data: cart } = useCart();
  const { schedule } = useCartActions();
  const serviceIds = useMemo(() => (cart?.items ?? []).filter((i) => i.kind === 'SERVICE').map((i) => i.refId), [cart]);
  const [sel, setSel] = useState<string>('any');

  const { data, isLoading } = useQuery({
    queryKey: ['barbers-at', date, time, serviceIds],
    queryFn: () => api.get<BarbersAtView>('/availability/barbers', { date, time, services: serviceIds }),
    enabled: !!date && !!time && serviceIds.length > 0,
  });

  // Veio do perfil de um profissional? Já deixa a pessoa marcada se estiver livre.
  useEffect(() => {
    if (!data) return;
    const preferred = typeof window !== 'undefined' ? window.sessionStorage.getItem(PREFERRED_BARBER_KEY) : null;
    if (preferred && data.barbers.some((b) => b.id === preferred && b.free)) setSel(preferred);
  }, [data]);

  const confirm = () =>
    schedule.mutate(
      { date, time, barberId: sel === 'any' ? null : sel },
      {
        onSuccess: () => {
          window.sessionStorage.removeItem(PREFERRED_BARBER_KEY);
          router.push('/pagamento');
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  const weekday = date ? cap(longDate(date).split(',')[0]!) : '';

  return (
    <>
      <Body>
        <TopNav title="Com quem?" back step="Passo 3 de 3" />
        <div className="card raised mb-4 flex items-center gap-2.5 !px-[13px] !py-[11px]">
          <Icon name="clock" />
          <span className="s b">
            {weekday}, {Number(date.slice(8))} · {time}
          </span>
          <span className="sp" />
          <Link className="xs lnk" href={`/agendar/horario?data=${date}`}>
            trocar
          </Link>
        </div>
        <button
          type="button"
          className={cn('card mb-4 flex w-full cursor-pointer items-center gap-3 text-left text-[var(--ink)]', sel === 'any' && 'sel')}
          aria-pressed={sel === 'any'}
          onClick={() => setSel('any')}
        >
          <span className="av b !h-11 !w-11">
            <Icon name="users" />
          </span>
          <span className="flex-1">
            <span className="s b block">Qualquer profissional</span>
            <span className="xs muted mt-[3px] block">A casa escolhe quem estiver livre — costuma começar mais no horário</span>
          </span>
          <span className={cn('radio', sel === 'any' && 'on')} />
        </button>
        <div className="rowx xs muted mb-3">
          <span>Ou escolha quem você já conhece</span>
          <span className="sp" />
          <span>{data ? `${data.freeCount} ${data.freeCount === 1 ? 'livre' : 'livres'} às ${time}` : ''}</span>
        </div>
        {isLoading ? (
          <div className="stack">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[72px]" />
            ))}
          </div>
        ) : (
          <Reveal className="stack" deps={[data?.barbers.length]}>
            {data?.barbers.map((b) => (
              <button
                key={b.id}
                type="button"
                disabled={!b.free}
                className={cn('card flex w-full items-center gap-3 text-left text-[var(--ink)]', sel === b.id && 'sel', b.free ? 'cursor-pointer' : 'cursor-default opacity-45')}
                aria-pressed={sel === b.id}
                onClick={() => setSel(b.id)}
              >
                <Avatar data={b.avatar} size={44} />
                <span className="flex-1">
                  <span className="s b block">{b.name}</span>
                  <span className="xs muted mb-1 mt-[3px] block">{b.free ? b.headline : `Ocupado até ${b.busyUntil}`}</span>
                  {b.free ? <RatingBadge average={b.rating.average} count={b.rating.count} /> : null}
                </span>
                {b.free ? <span className={cn('radio', sel === b.id && 'on')} /> : null}
              </button>
            ))}
          </Reveal>
        )}
      </Body>
      <Foot>
        <Button onClick={confirm} loading={schedule.isPending} disabled={!data || data.freeCount === 0}>
          Ir para o pagamento
        </Button>
      </Foot>
    </>
  );
}

export default function BarberPage() {
  return (
    <Screen>
      <Suspense>
        <RequireAuth>{() => <BarberPicker />}</RequireAuth>
      </Suspense>
    </Screen>
  );
}
