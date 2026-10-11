'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Avatar, Stars } from '@/components/brand/brand';
import { api } from '@/lib/api';
import { brDate, dateKey } from '@/lib/format';
import type { ReviewPage } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Avaliações públicas em páginas de 5 (serviço, produto e profissional).
 * A primeira página já vem no detalhe; as outras são buscadas em `url`.
 */
export function ReviewList({ url, initial, empty = 'Ainda sem avaliações.' }: { url: string; initial: ReviewPage; empty?: string }) {
  const [page, setPage] = useState(1);
  const top = useRef<HTMLDivElement>(null);
  const { data, isFetching } = useQuery({
    queryKey: ['reviews', url, page],
    queryFn: () => api.get<ReviewPage>(url, { page }),
    initialData: page === 1 ? initial : undefined,
    placeholderData: keepPreviousData,
  });
  const current = data ?? initial;
  const pages = Math.max(1, Math.ceil(current.total / current.pageSize));

  const go = (p: number) => {
    setPage(p);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!current.total) return <p className="xs muted">{empty}</p>;

  return (
    <div ref={top} className="scroll-mt-4">
      <div className={cn('stack transition-opacity', isFetching && 'opacity-60')}>
        {current.items.map((r) => (
          <div className="card" key={r.id}>
            <div className="rowx mb-[9px]">
              <Avatar data={r.avatar} size={32} />
              <div className="min-w-0">
                <div className="s b">{r.name}</div>
                <div className="xs muted">{brDate(dateKey(r.createdAt))}</div>
              </div>
              <span className="sp" />
              <Stars value={r.rating} />
            </div>
            {r.text ? <p className="m muted">{r.text}</p> : <p className="xs muted italic">Deu nota sem comentar.</p>}
          </div>
        ))}
      </div>
      {pages > 1 ? (
        <nav className="pager mt-3 justify-center" aria-label="Páginas de avaliações">
          <button type="button" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Página anterior">
            ‹
          </button>
          {pageList(page, pages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="px-1">
                …
              </span>
            ) : (
              <button key={p} type="button" className={cn(p === page && 'on')} onClick={() => go(p)} aria-current={p === page ? 'page' : undefined}>
                {p}
              </button>
            ),
          )}
          <button type="button" disabled={page >= pages} onClick={() => go(page + 1)} aria-label="Próxima página">
            ›
          </button>
        </nav>
      ) : null}
      <p className="xs muted center mt-2">
        {(page - 1) * current.pageSize + 1}–{Math.min(current.total, page * current.pageSize)} de {current.total} avaliações
      </p>
    </div>
  );
}

function pageList(page: number, pages: number): (number | null)[] {
  if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  set.forEach((p, i) => {
    if (i && p - set[i - 1]! > 1) out.push(null);
    out.push(p);
  });
  return out;
}
