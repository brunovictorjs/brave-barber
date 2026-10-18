'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Avatar, RatingBadge, Stars } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { BarberTabBar, Body, Screen } from '@/components/client/shell';
import { ChromeText, Reveal } from '@/components/motion/motion';
import { ChipGroup, Skeleton } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { rating } from '@/lib/format';
import { useLogout, useMe } from '@/lib/session';
import type { ReviewView } from '@/lib/types';

type Filter = 'all' | 'five' | 'below4' | 'text';

/** Minhas avaliações + atalhos do perfil (tela 31). */
export default function BarberProfilePage() {
  const { data: me } = useMe();
  const logout = useLogout();
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filter]);
  const { data } = useQuery({
    queryKey: ['staff-reviews', filter, page],
    queryFn: () =>
      api.get<{ average: number | null; count: number; distribution: { rating: number; count: number }[]; items: ReviewView[]; total: number; page: number; pageSize: number }>('/staff/reviews', { filter, page }),
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const max = Math.max(1, ...(data?.distribution.map((d) => d.count) ?? [1]));

  return (
    <Screen size="medium">
      <Body>
        <div className="topnav">
          <h1 className="ttl">Minhas avaliações</h1>
          {me ? (
            <Link href="/perfil/sobre" aria-label="Editar perfil público">
              <Avatar data={me.avatar} size={38} />
            </Link>
          ) : null}
        </div>
        {!data ? (
          <Skeleton className="h-32" />
        ) : (
          <Reveal deps={[filter]}>
            <section className="card raised mb-[18px] flex items-center gap-[18px]">
              <div className="center">
                <ChromeText as="div" className="num text-[44px] font-extrabold leading-none">
                  {rating(data.average)}
                </ChromeText>
                <Stars value={data.average ?? 0} className="mt-[5px]" />
                <div className="xs muted mt-[5px]">{data.count} notas</div>
              </div>
              <div className="flex-1" role="img" aria-label={`Distribuição: ${data.distribution.map((d) => `${d.count} notas ${d.rating}`).join(', ')}`}>
                {data.distribution.map((d) => (
                  <div className="rowx xs muted mb-1.5 gap-2" key={d.rating}>
                    {d.rating}
                    <div className="prog h-[5px] flex-1">
                      <i style={{ width: `${(d.count / max) * 100}%` }} />
                    </div>
                    <span className="num w-6 text-right">{d.count}</span>
                  </div>
                ))}
              </div>
            </section>
            <ChipGroup
              className="mb-3.5"
              label="Filtrar avaliações"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'Todas' },
                { value: 'five', label: '5 estrelas' },
                { value: 'below4', label: 'Abaixo de 4' },
                { value: 'text', label: 'Com texto' },
              ]}
            />
            <div className="stack">
              {data.items.map((r) => (
                <article className="card" key={r.id}>
                  <div className="rowx mb-[9px]">
                    <Avatar data={r.customer.avatar} size={30} />
                    <div>
                      <div className="s b">{r.customer.name}</div>
                      <div className="xs muted">
                        {r.serviceLabel} · {r.dateLabel}
                      </div>
                    </div>
                    <span className="sp" />
                    <RatingBadge average={r.barberRating} />
                  </div>
                  {r.text ? <p className="m muted">{r.text}</p> : <p className="xs muted italic">sem texto</p>}
                  {r.reply ? (
                    <div className="mt-2.5 border-l-2 border-[#3a3a3a] pl-3">
                      <div className="xs b mb-0.5">Resposta da casa</div>
                      <p className="xs muted">{r.reply}</p>
                    </div>
                  ) : null}
                </article>
              ))}
              {!data.items.length ? <p className="xs muted">Nenhuma avaliação com esse filtro.</p> : null}
            </div>
            {pages > 1 ? (
              <nav className="pager mt-3 justify-center" aria-label="Páginas de avaliações">
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Página anterior">
                  ‹
                </button>
                <span className="px-2">
                  {page} de {pages}
                </span>
                <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Próxima página">
                  ›
                </button>
              </nav>
            ) : null}
            <nav className="card list mt-6 !px-3.5 !py-0.5" aria-label="Conta">
              <Link className="li" href="/perfil/sobre">
                <Icon name="edit" />
                <span className="flex-1">
                  <span className="s b block">Perfil público</span>
                  <span className="xs muted">Texto que aparece na vitrine</span>
                </span>
                <Icon name="chev" size="s" className="muted" />
              </Link>
              <Link className="li" href="/barbeiro/avisos">
                <Icon name="bell" />
                <span className="s b flex-1">Avisos</span>
                <Icon name="chev" size="s" className="muted" />
              </Link>
              {me?.roles.includes('ADMIN') ? (
                <Link className="li" href="/admin">
                  <Icon name="chart" />
                  <span className="s b flex-1">Painel da casa</span>
                  <Icon name="chev" size="s" className="muted" />
                </Link>
              ) : null}
            </nav>
            <button type="button" onClick={logout} className="rowx xs b mx-auto mt-5 cursor-pointer justify-center gap-1.5 border-0 bg-transparent text-[var(--ink)]">
              <Icon name="logout" size="s" />
              Sair da conta
            </button>
          </Reveal>
        )}
      </Body>
      <BarberTabBar />
    </Screen>
  );
}
