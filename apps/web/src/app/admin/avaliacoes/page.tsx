'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { AdminHeader, DateRange, Kpi, Pager, SearchBox, SelectFilter } from '@/components/admin/shell';
import { usePeriod } from '@/components/admin/period';
import { Icon } from '@/components/brand/icon';
import { ChromeText, Reveal } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Switch, Textarea } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { rating } from '@/lib/format';
import type { Page, ReviewView } from '@/lib/types';

interface Reviews extends Page<ReviewView> {
  kpis: { average: number | null; count: number; onHome: number; below4: number; below4Week: number; responseRatePct: number };
}

/** Avaliações (tela 42): vitrine da home e respostas da casa. */
export default function ReviewsAdminPage() {
  const qc = useQueryClient();
  const [range, setRange] = usePeriod(37);
  const [ratingFilter, setRating] = useState('');
  const [onHome, setOnHome] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [replying, setReplying] = useState<ReviewView | null>(null);
  const [reply, setReply] = useState('');
  const search = useDeferredValue(q);
  const query = { ...range, rating: ratingFilter || undefined, onHome: onHome || undefined, q: search || undefined, page };
  const { data, isLoading } = useQuery({ queryKey: ['admin-reviews', query], queryFn: () => api.get<Reviews>('/admin/reviews', query), placeholderData: keepPreviousData });

  const toggle = useMutation({
    mutationFn: (v: { id: string; show: boolean }) => api.patch(`/admin/reviews/${v.id}/home`, { show: v.show }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-reviews'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const send = useMutation({
    mutationFn: () => api.post(`/admin/reviews/${replying!.id}/reply`, { text: reply }),
    onSuccess: () => {
      toast.success('Resposta publicada');
      setReplying(null);
      void qc.invalidateQueries({ queryKey: ['admin-reviews'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <AdminHeader url="/avaliacoes" title="Avaliações">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Buscar no texto…" width={140} />
      </AdminHeader>
      <main className="acontent">
        {data ? (
          <div className="kpis">
            <Kpi label="Nota geral" value={<ChromeText className="text-[28px]">{rating(data.kpis.average)}</ChromeText>} delta={`${data.kpis.count} avaliações`} />
            <Kpi label="No carrossel da home" value={<span className="text-[28px]">{data.kpis.onHome}</span>} delta="com todos os campos" />
            <Kpi label="Abaixo de 4 estrelas" value={<span className="text-[28px]">{data.kpis.below4}</span>} delta={`${data.kpis.below4Week} nos últimos 7 dias`} tone="dn" />
            <Kpi label="Taxa de resposta" value={<span className="text-[28px]">{data.kpis.responseRatePct}%</span>} delta="dos pedidos concluídos" />
          </div>
        ) : null}
        <div className="filters">
          <DateRange from={range.from} to={range.to} onChange={(v) => { setRange(v); setPage(1); }} />
          <SelectFilter label="Nota" value={ratingFilter} onChange={(v) => { setRating(v); setPage(1); }} options={[{ value: '', label: 'Todas' }, { value: '5', label: '5 estrelas' }, { value: '4', label: '4 no serviço' }, { value: 'below4', label: 'Abaixo de 4' }]} />
          <SelectFilter label="Na home" value={onHome} onChange={(v) => { setOnHome(v); setPage(1); }} options={[{ value: '', label: 'Indiferente' }, { value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]} />
          <span className="sp" />
          <span className="xs muted">{data?.total ?? 0} avaliações no período</span>
        </div>
        {isLoading ? (
          <Skeleton className="h-96" />
        ) : (
          <Reveal className="tbl" deps={[page, JSON.stringify(query)]}>
            <table className="t min-w-[1040px]">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Pedido</th>
                  <th>Serviço</th>
                  <th>Profissional</th>
                  <th className="r">Nota serv.</th>
                  <th className="r">Nota prof.</th>
                  <th>Texto</th>
                  <th>Na home</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.items.map((r) => (
                  <tr key={r.id}>
                    <td className="b">{r.customer.name}</td>
                    <td className="code xs">{r.orderCode}</td>
                    <td>{r.serviceLabel}</td>
                    <td>{r.barber?.name ?? '—'}</td>
                    <td className="r">{rating(r.serviceRating)}</td>
                    <td className="r">{rating(r.barberRating)}</td>
                    <td className="muted max-w-[320px] !whitespace-normal" style={{ fontStyle: r.text ? 'normal' : 'italic' }}>
                      {r.text ?? 'sem texto'}
                      {r.reply ? <div className="xs mt-1 text-[var(--ink)]">↳ {r.reply}</div> : null}
                    </td>
                    <td>
                      <Switch
                        checked={r.showOnHome}
                        disabled={!r.eligibleForHome || toggle.isPending}
                        onCheckedChange={(show) => toggle.mutate({ id: r.id, show })}
                        aria-label={`Mostrar na home: ${r.customer.name}`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ibtn !h-8 !w-8"
                        aria-label={r.reply ? 'Editar resposta' : 'Responder'}
                        onClick={() => {
                          setReplying(r);
                          setReply(r.reply ?? '');
                        }}
                      >
                        <Icon name="reply" size="s" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        )}
        <section className="card note mt-4">
          <div className="rowx items-start gap-2.5">
            <Icon name="info" />
            <p className="xs muted leading-[1.65]">
              Entram no carrossel da home as avaliações com <b className="text-[var(--ink)]">nota do serviço, nota do profissional, texto e serviço preenchidos</b> e média 5,0. A coluna &quot;na home&quot; permite tirar uma avaliação da vitrine sem apagá-la.
            </p>
          </div>
        </section>
        {data ? <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
      </main>
      <Dialog open={!!replying} onOpenChange={(v) => !v && setReplying(null)}>
        <DialogContent wide>
          <DialogTitle className="disp mb-1 pr-10 text-[20px]">Responder avaliação</DialogTitle>
          <DialogDescription className="xs muted mb-4">
            {replying?.customer.name} · {replying?.serviceLabel}
          </DialogDescription>
          {replying?.text ? <blockquote className="card m mb-4 italic text-[var(--ink-muted)]">“{replying.text}”</blockquote> : null}
          <label className="field mb-4">
            <span>Resposta da casa</span>
            <Textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={600} placeholder="Agradeça e, se for o caso, conte o que vai mudar." />
          </label>
          <Button onClick={() => send.mutate()} loading={send.isPending} disabled={reply.trim().length < 2}>
            Publicar resposta
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
