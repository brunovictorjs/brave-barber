'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AdminHeader, DateRange, Kpi, useStaffMe } from '@/components/admin/shell';
import { usePeriod } from '@/components/admin/period';
import { Bars, ChromeText, CountUp, Donut, Reveal } from '@/components/motion/motion';
import { Skeleton } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { money, rating } from '@/lib/format';

interface Overview {
  period: { from: string; to: string; label: string };
  kpis: {
    revenueCents: number;
    revenueDeltaPct: number | null;
    paidOrders: number;
    paidOrdersDelta: number;
    avgTicketCents: number;
    avgTicketDeltaCents: number;
    cancelled: number;
    cancelledDelta: number;
    refundedCents: number;
  };
  byDay: { date: string; label: string; cents: number; today: boolean }[];
  byCategory: { name: string; cents: number; pct: number }[];
  topServices: { name: string; orders: number; cents: number }[];
  byBarber: { id: string; name: string; appointments: number; rating: number | null; cents: number }[];
}

/** Visão geral (tela 33). */
export default function DashboardPage() {
  const me = useStaffMe();
  const router = useRouter();
  const isAdmin = me.roles.includes('ADMIN');
  const [range, setRange] = usePeriod();
  const { data: o } = useQuery({
    queryKey: ['overview', range],
    queryFn: () => api.get<Overview>('/admin/reports/overview', range),
    enabled: isAdmin,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!isAdmin) router.replace('/admin/balcao');
  }, [isAdmin, router]);
  if (!isAdmin) return null;

  const todayIndex = o?.byDay.findIndex((d) => d.today) ?? -1;

  return (
    <>
      <AdminHeader url="" title="Visão geral">
        <DateRange from={range.from} to={range.to} onChange={setRange} />
        <span className="fsel">
          <b>Comparando com o período anterior</b>
        </span>
      </AdminHeader>
      <main className="acontent">
        {!o ? (
          <div className="kpis">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[92px]" />
            ))}
          </div>
        ) : (
          <Reveal deps={[range.from, range.to]}>
            <div className="kpis">
              <Kpi
                label="Faturamento"
                value={
                  <ChromeText className="text-[28px]">
                    <CountUp value={o.kpis.revenueCents} format={(n) => money(n)} />
                  </ChromeText>
                }
                delta={o.kpis.revenueDeltaPct !== null ? `${o.kpis.revenueDeltaPct >= 0 ? '+' : ''}${o.kpis.revenueDeltaPct}% vs. período anterior` : 'sem base de comparação'}
                tone={o.kpis.revenueDeltaPct === null ? 'nt' : o.kpis.revenueDeltaPct < 0 ? 'dn' : 'up'}
              />
              <Kpi label="Pedidos pagos" value={<span className="text-[28px]"><CountUp value={o.kpis.paidOrders} format={String} /></span>} delta={`${o.kpis.paidOrdersDelta >= 0 ? '+' : ''}${o.kpis.paidOrdersDelta}`} tone={o.kpis.paidOrdersDelta < 0 ? 'dn' : 'up'} />
              <Kpi
                label="Ticket médio"
                value={<span className="text-[28px]">{money(o.kpis.avgTicketCents)}</span>}
                delta={`${o.kpis.avgTicketDeltaCents >= 0 ? '+' : '−'}${money(Math.abs(o.kpis.avgTicketDeltaCents))}`}
                tone={o.kpis.avgTicketDeltaCents < 0 ? 'dn' : 'up'}
              />
              <Kpi label="Cancelados e estornados" value={<span className="text-[28px]">{o.kpis.cancelled}</span>} delta={`${money(o.kpis.refundedCents)} devolvidos`} tone="dn" />
            </div>
            <div className="cols mb-4">
              <section className="card" style={{ flex: '1.6 1 420px' }}>
                <div className="rowx mb-4">
                  <h2 className="s b m-0">Faturamento por dia</h2>
                  <span className="sp" />
                  <span className="lgnd m-0">
                    <i className="s2" />
                    pago
                  </span>
                  <span className="lgnd m-0 ml-3">
                    <i className="s1" />
                    hoje
                  </span>
                </div>
                <Bars values={o.byDay.map((d) => d.cents)} highlight={todayIndex} height={150} label={`Faturamento por dia de ${o.period.label}`} />
                <div className="xaxis">
                  {o.byDay.map((d) => (
                    <span key={d.date}>{d.label}</span>
                  ))}
                </div>
              </section>
              <section className="card" style={{ flex: '1 1 280px' }}>
                <h2 className="s b mb-4 mt-0">Por categoria</h2>
                <div className="rowx gap-[18px]">
                  <Donut parts={o.byCategory.map((c) => c.cents)} label={o.byCategory.map((c) => `${c.name} ${c.pct}%`).join(', ')} />
                  <div className="flex-1">
                    {o.byCategory.map((c, i) => (
                      <div className="lgnd" key={c.name}>
                        <i className={`s${i + 1}`} />
                        {c.name}
                        <span className="sp" />
                        <span className="v">{money(c.cents)}</span>
                      </div>
                    ))}
                    {!o.byCategory.length ? <p className="xs muted">Sem vendas no período.</p> : null}
                  </div>
                </div>
              </section>
            </div>
            <div className="cols">
              <section className="card" style={{ flex: '1 1 360px' }}>
                <h2 className="s b mb-3 mt-0">Serviços mais vendidos</h2>
                <div className="tbl">
                  <table className="t">
                    <thead>
                      <tr>
                        <th>Serviço</th>
                        <th className="r">Pedidos</th>
                        <th className="r">Receita</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.topServices.map((s) => (
                        <tr key={s.name}>
                          <td>{s.name}</td>
                          <td className="r">{s.orders}</td>
                          <td className="r b">{money(s.cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="card" style={{ flex: '1 1 360px' }}>
                <h2 className="s b mb-3 mt-0">Desempenho por profissional</h2>
                <div className="tbl">
                  <table className="t">
                    <thead>
                      <tr>
                        <th>Profissional</th>
                        <th className="r">Atend.</th>
                        <th className="r">Nota</th>
                        <th className="r">Receita</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.byBarber.map((b) => (
                        <tr key={b.id}>
                          <td>{b.name}</td>
                          <td className="r">{b.appointments}</td>
                          <td className="r">{rating(b.rating)}</td>
                          <td className="r b">{money(b.cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </Reveal>
        )}
      </main>
    </>
  );
}
