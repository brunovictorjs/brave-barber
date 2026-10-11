'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Avatar } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { BarberTabBar, Body, Screen } from '@/components/client/shell';
import { Bars, ChromeText, CountUp, Donut, Reveal } from '@/components/motion/motion';
import { ChipGroup, Skeleton } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { money, rate, rating } from '@/lib/format';
import type { Earnings } from '@/lib/types';
import { cn } from '@/lib/utils';

const PERIODS = [
  { value: 'month', label: 'Este mês' },
  { value: 'week', label: 'Semana' },
  { value: 'last_month', label: 'Mês passado' },
] as const;

type Period = (typeof PERIODS)[number]['value'];
type Filter = 'all' | 'completed' | 'cancelled';

/** Meus ganhos (tela 30). */
export default function EarningsPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const { data: e } = useQuery({
    queryKey: ['earnings', period, filter, page],
    queryFn: () => api.get<Earnings>('/staff/earnings', { period, filter, page }),
    placeholderData: keepPreviousData,
  });

  const exportCsv = () => {
    if (!e) return;
    const rows = [['Código', 'Cliente', 'Atendimento', 'Comissão'], ...e.list.items.map((r) => [r.code ?? 'avulso', r.customerName, r.summary, (r.commissionCents / 100).toFixed(2).replace('.', ',')])];
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `meus-ganhos-${e.period.from}-a-${e.period.to}.csv`;
    a.click();
  };

  const pages = e ? Math.max(1, Math.ceil(e.list.counts[filter] / e.list.pageSize)) : 1;
  const max = e ? e.byDay.reduce((m, d, i) => (d.cents > (e.byDay[m]?.cents ?? 0) ? i : m), 0) : 0;

  return (
    <Screen>
      <Body>
        <div className="topnav">
          <h1 className="ttl">Meus ganhos</h1>
          <button type="button" className="ibtn" aria-label="Exportar" onClick={exportCsv}>
            <Icon name="download" />
          </button>
        </div>
        <ChipGroup
          className="mb-4"
          label="Período"
          value={period}
          onChange={(v) => {
            setPeriod(v);
            setPage(1);
          }}
          options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
        />
        {!e ? (
          <div className="stack">
            <Skeleton className="h-44" />
            <Skeleton className="h-40" />
          </div>
        ) : (
          <Reveal deps={[period]}>
            <section className="card raised mb-3.5" style={{ background: 'repeating-linear-gradient(90deg, rgba(255,255,255,.03) 0 1px, transparent 1px 3px), linear-gradient(160deg, #2a2a2a, #111)' }}>
              <div className="xs muted">Comissão de {e.period.label}</div>
              <ChromeText as="div" className="num mb-1 mt-1.5 text-[44px] font-extrabold leading-[1.05]">
                <CountUp value={e.totalCents} format={(n) => money(n)} />
              </ChromeText>
              {e.deltaPct !== null ? (
                <div className="rowx xs gap-[7px]">
                  <Icon name="trend" size="s" />
                  {e.deltaPct >= 0 ? '+' : ''}
                  {e.deltaPct}% em relação ao período anterior
                </div>
              ) : null}
              <div className="divider" />
              <div className="rowx xs muted mb-[7px]">
                <span>
                  Execução · {rate(e.service.rateBps)} sobre {money(e.service.baseCents)}
                </span>
                <span className="sp" />
                <span className="text-[var(--ink)]">{money(e.service.cents)}</span>
              </div>
              <div className="rowx xs muted mb-[7px]">
                <span>
                  Produtos · {rate(e.product.rateBps)} sobre {money(e.product.baseCents)}
                </span>
                <span className="sp" />
                <span className="text-[var(--ink)]">{money(e.product.cents)}</span>
              </div>
              <div className="rowx xs muted">
                <span>{e.payoutLabel}</span>
              </div>
            </section>
            <div className="g2 mb-3.5">
              <div className="kpi">
                <div className="lab">Atendimentos</div>
                <div className="val">{e.kpis.appointments}</div>
                <div className={cn('dl', e.kpis.appointmentsDelta < 0 && 'dn')}>{e.kpis.appointmentsDelta >= 0 ? '+' : ''}{e.kpis.appointmentsDelta}</div>
              </div>
              <div className="kpi">
                <div className="lab">Ticket médio</div>
                <div className="val">{money(e.kpis.avgTicketCents)}</div>
                <div className={cn('dl', e.kpis.avgTicketDeltaCents < 0 && 'dn')}>
                  {e.kpis.avgTicketDeltaCents >= 0 ? '+' : '−'}
                  {money(Math.abs(e.kpis.avgTicketDeltaCents))}
                </div>
              </div>
              <div className="kpi">
                <div className="lab">Horas na cadeira</div>
                <div className="val">{e.kpis.chairHours}h</div>
                <div className="dl nt">ocupação {e.kpis.occupancyPct}%</div>
              </div>
              <div className="kpi">
                <div className="lab">Sua nota</div>
                <div className="val">{rating(e.kpis.rating)}</div>
                <div className="dl nt">{e.kpis.ratingCount} avaliações</div>
              </div>
            </div>
            <section className="card mb-3.5">
              <div className="rowx mb-3.5">
                <div className="s b">Por dia</div>
                <span className="sp" />
                <span className="xs muted">últimos 7 dias</span>
              </div>
              <Bars values={e.byDay.map((d) => d.cents)} highlight={max} label="Comissão por dia nos últimos 7 dias" />
              <div className="xaxis">
                {e.byDay.map((d) => (
                  <span key={d.date}>{d.label}</span>
                ))}
              </div>
            </section>
            {e.byCategory.length ? (
              <section className="card">
                <div className="s b mb-3.5">De onde vem o dinheiro</div>
                <div className="rowx gap-4">
                  <Donut parts={e.byCategory.map((c) => c.pct)} label={e.byCategory.map((c) => `${c.name} ${c.pct}%`).join(', ')} />
                  <div className="flex-1">
                    {e.byCategory.map((c, i) => (
                      <div className="lgnd" key={c.name}>
                        <i className={`s${i + 1}`} />
                        {c.name}
                        <span className="sp" />
                        <span className="v">{c.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}
            <div className="sec-row">
              <h2 className="sec">Atendimentos do período</h2>
              <button type="button" className="more" onClick={exportCsv}>
                exportar
              </button>
            </div>
            <ChipGroup
              className="mb-3"
              label="Situação"
              value={filter}
              onChange={(v) => {
                setFilter(v);
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'Todos', count: e.list.counts.all },
                { value: 'completed', label: 'Concluídos', count: e.list.counts.completed },
                { value: 'cancelled', label: 'Cancelados', count: e.list.counts.cancelled },
              ]}
            />
            <div className="stack">
              {e.list.items.map((r) => (
                <div key={r.id} className={cn('card', r.status === 'CANCELLED' && 'opacity-70')}>
                  <div className="rowx mb-[9px]">
                    <span className={r.status === 'CANCELLED' ? 'badge bad dot' : 'badge n dot'}>{r.status === 'CANCELLED' ? 'Cancelado' : r.origin === 'WALK_IN' ? 'Concluído · avulso' : 'Concluído'}</span>
                    <span className="sp" />
                    <span className="code xs muted">{r.code ?? 'sem código'}</span>
                  </div>
                  <div className="rowx">
                    <Avatar data={r.avatar} size={30} />
                    <div className="flex-1">
                      <div className="s b">{r.customerName}</div>
                      <div className="xs muted mt-0.5">{r.summary}</div>
                    </div>
                    <div className="text-right">
                      <div className="price">{money(r.commissionCents)}</div>
                      <div className="xs muted mt-0.5">{r.detail}</div>
                    </div>
                  </div>
                  {r.timeLabel ? (
                    <>
                      <div className="divider mb-[9px] mt-[11px]" />
                      <div className="rowx xs muted">
                        <span className="rowx gap-[5px]">
                          <Icon name="clock" size="s" />
                          {r.timeLabel}
                        </span>
                        <span className="sp" />
                        <span className="rate text-[var(--ink)]">{r.rating ? `★ ${r.rating}` : 'sem avaliação'}</span>
                      </div>
                    </>
                  ) : null}
                </div>
              ))}
              {!e.list.items.length ? <p className="xs muted">Nenhum atendimento neste período.</p> : null}
            </div>
            {pages > 1 ? (
              <div className="rowx mb-1 mt-4 justify-center gap-1.5">
                {Array.from({ length: Math.min(pages, 6) }, (_, i) => (
                  <button key={i} type="button" className={cn('chip min-w-9 justify-center', page === i + 1 && 'on')} onClick={() => setPage(i + 1)}>
                    {i + 1}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="xs muted center mt-2">
              {e.list.items.length} de {e.list.counts[filter]} atendimentos
            </p>
          </Reveal>
        )}
      </Body>
      <BarberTabBar />
    </Screen>
  );
}
