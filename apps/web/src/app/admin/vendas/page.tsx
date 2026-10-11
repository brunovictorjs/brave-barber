'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AdminHeader, DateRange, Kpi, SelectFilter } from '@/components/admin/shell';
import { usePeriod } from '@/components/admin/period';
import { Icon } from '@/components/brand/icon';
import { Bars, Donut, Reveal } from '@/components/motion/motion';
import { Skeleton } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { longDate, money } from '@/lib/format';

interface Sales {
  period: { from: string; to: string; label: string };
  kpis: { grossCents: number; paidOrders: number; refundsCents: number; refundsCount: number; feesCents: number; commissionsCents: number; barbersCount: number; netCents: number; marginPct: number };
  byDay: { label: string; cents: number; today: boolean }[];
  byMethod: { method: 'PIX' | 'CREDIT' | 'DEBIT' | 'COUNTER'; cents: number }[];
  rows: { date: string; label: string; orders: number; grossCents: number; refundsCents: number; feesCents: number; commissionsCents: number; netCents: number }[];
  nextPayout: string;
  payoutSchedule: string;
}

const METHOD_LABEL = { PIX: 'Pix', CREDIT: 'Crédito', DEBIT: 'Débito', COUNTER: 'Balcão' };

/** Vendas (tela 34). */
export default function SalesPage() {
  const [range, setRange] = usePeriod();
  const [groupBy, setGroupBy] = useState<'day' | 'week'>('day');
  const [method, setMethod] = useState<'' | 'PIX' | 'CREDIT' | 'DEBIT' | 'COUNTER'>('');
  const [barberId, setBarberId] = useState('');
  const { data: barbers } = useQuery({ queryKey: ['catalog-barbers'], queryFn: () => api.get<{ id: string; name: string }[]>('/catalog/barbers') });
  const query = { ...range, groupBy, method: method || undefined, barberId: barberId || undefined };
  const { data: s } = useQuery({ queryKey: ['sales', query], queryFn: () => api.get<Sales>('/admin/reports/sales', query), placeholderData: keepPreviousData });
  const minus = (c: number) => (c ? money(-c) : '—');

  return (
    <>
      <AdminHeader url="/vendas" title="Vendas" />
      <main className="acontent">
        <div className="filters">
          <DateRange from={range.from} to={range.to} onChange={setRange} />
          <SelectFilter label="Agrupar por" value={groupBy} onChange={setGroupBy} options={[{ value: 'day', label: 'Dia' }, { value: 'week', label: 'Semana' }]} />
          <SelectFilter label="Pagamento" value={method} onChange={setMethod} options={[{ value: '', label: 'Todos' }, { value: 'PIX', label: 'Pix' }, { value: 'CREDIT', label: 'Crédito' }, { value: 'DEBIT', label: 'Débito' }, { value: 'COUNTER', label: 'Balcão' }]} />
          <SelectFilter label="Profissional" value={barberId} onChange={setBarberId} options={[{ value: '', label: 'Todos' }, ...(barbers ?? []).map((b) => ({ value: b.id, label: b.name }))]} />
          <span className="sp" />
          <a className="btn sm dark" href={api.url('/admin/reports/sales.csv', query)}>
            <Icon name="download" size="s" />
            Exportar CSV
          </a>
        </div>
        {!s ? (
          <Skeleton className="h-64" />
        ) : (
          <Reveal deps={[JSON.stringify(query)]}>
            <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              <Kpi label="Bruto vendido" value={money(s.kpis.grossCents)} delta={`${s.kpis.paidOrders} pedidos pagos`} />
              <Kpi label="Estornos" value={minus(s.kpis.refundsCents)} delta={`${s.kpis.refundsCount} cancelamentos`} tone="dn" />
              <Kpi label="Taxas Stripe" value={minus(s.kpis.feesCents)} delta="Pix 1,19% · cartão 3,99% + R$ 0,39" />
              <Kpi label="Comissões" value={minus(s.kpis.commissionsCents)} delta={`${s.kpis.barbersCount} profissionais`} />
              <Kpi label="Líquido da casa" value={money(s.kpis.netCents)} delta={`margem ${String(s.kpis.marginPct).replace('.', ',')}%`} highlight />
            </div>
            <div className="cols mb-4">
              <section className="card" style={{ flex: '1.5 1 400px' }}>
                <div className="rowx mb-3.5">
                  <h2 className="s b m-0">Bruto por {groupBy === 'day' ? 'dia' : 'semana'}</h2>
                  <span className="sp" />
                  <span className="lgnd m-0">
                    <i className="s2" />
                    vendido
                  </span>
                  <span className="lgnd m-0 ml-3">
                    <i className="s1" />
                    hoje
                  </span>
                </div>
                <Bars values={s.byDay.map((d) => d.cents)} highlight={s.byDay.findIndex((d) => d.today)} height={112} label="Bruto vendido no período" />
                <div className="xaxis">
                  {s.byDay.map((d) => (
                    <span key={d.label}>{d.label.split(',')[0]}</span>
                  ))}
                </div>
              </section>
              <section className="card" style={{ flex: '1 1 280px' }}>
                <h2 className="s b mb-3.5 mt-0">Forma de pagamento</h2>
                <div className="rowx gap-4">
                  <Donut parts={s.byMethod.filter((m) => m.cents).slice(0, 3).map((m) => m.cents)} label={s.byMethod.map((m) => `${METHOD_LABEL[m.method]} ${money(m.cents)}`).join(', ')} />
                  <div className="flex-1">
                    {s.byMethod.map((m, i) => (
                      <div className="lgnd" key={m.method}>
                        <i className={i < 3 ? `s${i + 1}` : ''} style={i >= 3 ? { border: '1px dashed #8c8c8c' } : undefined} />
                        {METHOD_LABEL[m.method]}
                        <span className="sp" />
                        <span className="v">{money(m.cents)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="divider" />
                <div className="rowx xs muted">
                  <span>Próximo repasse do Stripe</span>
                  <span className="sp" />
                  <span className="b text-[var(--ink)]">{longDate(s.nextPayout).replace(/, (\d+) de (\w+)$/, (_, d, m) => `, ${d} ${m.slice(0, 3)}`)}</span>
                </div>
              </section>
            </div>
            <section className="card">
              <div className="rowx mb-3">
                <h2 className="s b m-0">Vendas do período</h2>
                <span className="sp" />
                <span className="xs muted">o líquido já desconta estorno, taxa e comissão</span>
              </div>
              <div className="tbl">
                <table className="t">
                  <thead>
                    <tr>
                      <th>{groupBy === 'day' ? 'Dia' : 'Semana'}</th>
                      <th className="r">Pedidos</th>
                      <th className="r">Bruto</th>
                      <th className="r">Estornos</th>
                      <th className="r">Taxas</th>
                      <th className="r">Comissões</th>
                      <th className="r">Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((r) => (
                      <tr key={r.date}>
                        <td>{r.label}</td>
                        <td className="r">{r.orders}</td>
                        <td className="r">{money(r.grossCents)}</td>
                        <td className={r.refundsCents ? 'r' : 'r muted'}>{minus(r.refundsCents)}</td>
                        <td className="r">{minus(r.feesCents)}</td>
                        <td className="r">{minus(r.commissionsCents)}</td>
                        <td className="r b">{money(r.netCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                <span>
                  {s.rows.length} {groupBy === 'day' ? 'dias' : 'semanas'} · {s.period.label}
                </span>
              </div>
            </section>
          </Reveal>
        )}
      </main>
    </>
  );
}
