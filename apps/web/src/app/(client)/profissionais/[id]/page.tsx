'use client';

import Link from 'next/link';
import { use } from 'react';
import { Avatar } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { useLoginRedirect } from '@/components/client/auth-guard';
import { ReviewList } from '@/components/client/review-list';
import { Body, Foot, Screen, TopNav } from '@/components/client/shell';
import { CountUp, Reveal } from '@/components/motion/motion';
import { Skeleton } from '@/components/ui/controls';
import { preferBarber } from '@/lib/booking';
import { rating } from '@/lib/format';
import { useBarberProfile, useToggleFavorite } from '@/lib/queries';
import { useMe } from '@/lib/session';

const fmt = (n: number) => String(n);

export default function BarberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: b } = useBarberProfile(id);
  const { data: me } = useMe();
  const login = useLoginRedirect();
  const toggle = useToggleFavorite();

  return (
    <Screen>
      <Body>
        <TopNav
          title="Profissional"
          back
          right={
            b ? (
              <button
                type="button"
                className="ibtn"
                aria-pressed={b.favorite}
                aria-label={b.favorite ? 'Remover dos favoritos' : 'Favoritar profissional'}
                onClick={() => (me ? toggle.mutate({ kind: 'barbers', id: b.id, on: !b.favorite }) : login())}
              >
                <Icon name={b.favorite ? 'heartf' : 'heart'} />
              </button>
            ) : null
          }
        />
        {!b ? (
          <div className="stack">
            <Skeleton className="mx-auto h-[88px] w-[88px] !rounded-full" />
            <Skeleton className="h-20" />
          </div>
        ) : (
          <Reveal>
            <div className="center mb-[18px]">
              <Avatar data={b.avatar} size={88} className="mx-auto mb-3 !text-[24px]" />
              <h2 className="disp m-0 text-[22px]">{b.name}</h2>
              <p className="m muted mt-1">
                {b.headline}
                {b.sinceYear ? ` · na casa desde ${b.sinceYear}` : ''}
              </p>
            </div>
            <div className="g3 mb-1">
              <div className="card center !px-1.5 !py-3">
                <div className="price text-[20px]">{rating(b.rating.average)}</div>
                <div className="xs muted">nota</div>
              </div>
              <div className="card center !px-1.5 !py-3">
                <CountUp className="price block text-[20px]" value={b.rating.count} format={fmt} />
                <div className="xs muted">avaliações</div>
              </div>
              <div className="card center !px-1.5 !py-3">
                <CountUp className="price block text-[20px]" value={b.completed} format={fmt} />
                <div className="xs muted">atendimentos</div>
              </div>
            </div>
            {b.about ? (
              <>
                <h3 className="sec">Sobre</h3>
                <p className="m muted leading-[1.65]">{b.about}</p>
              </>
            ) : null}
            <h3 className="sec">Faz estes serviços</h3>
            <div className="flex flex-wrap gap-2">
              {b.services.map((s) => (
                <Link key={s.id} className="chip" href={`/servicos/${s.slug}`}>
                  {s.name}
                </Link>
              ))}
            </div>
            <h3 className="sec">Avaliações</h3>
            <ReviewList url={`/reviews/barbers/${b.id}`} initial={b.reviews} />
          </Reveal>
        )}
      </Body>
      <Foot>
        <Link className="btn primary" href="/catalogo" onClick={() => b && preferBarber(b.id)}>
          Agendar com {b?.firstName ?? '…'}
        </Link>
      </Foot>
    </Screen>
  );
}
