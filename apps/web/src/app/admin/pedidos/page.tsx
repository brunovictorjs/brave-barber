'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { AdminHeader, DateRange, Pager, SearchBox, SelectFilter } from '@/components/admin/shell';
import { usePeriod } from '@/components/admin/period';
import { StatusBadge } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { Reveal } from '@/components/motion/motion';
import { ChipGroup, Skeleton } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { compactDateTime, money, money2 } from '@/lib/format';
import type { DisplayStatus, ServiceCard } from '@/lib/types';

interface Row {
  id: string;
  code: string;
  origin: 'SITE' | 'WALK_IN';
  type: 'APPOINTMENT' | 'PICKUP';
  customerName: string;
  itemsLabel: string;
  barberName: string;
  scheduledStart: string | null;
  paymentLabel: string;
  displayStatus: DisplayStatus;
  displayLabel: string;
  totalCents: number;
  amountDueCents: number;
}

interface List {
  period: { from: string; to: string };
  counts: Record<'ALL' | 'CART' | 'AWAITING_PAYMENT' | 'PAID' | 'COMPLETED' | 'CANCELLED', number>;
  total: number;
  totalCents: number;
  page: number;
  pageSize: number;
  items: Row[];
}

type Status = keyof List['counts'];

/** Pedidos (tela 35). */
export default function OrdersAdminPage() {
  const [range, setRange] = usePeriod(7, 30);
  const [status, setStatus] = useState<Status>('ALL');
  const [barberId, setBarberId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [method, setMethod] = useState('');
  const [origin, setOrigin] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const search = useDeferredValue(q);
  const { data: barbers } = useQuery({ queryKey: ['catalog-barbers'], queryFn: () => api.get<{ id: string; name: string }[]>('/catalog/barbers') });
  const { data: services } = useQuery({ queryKey: ['services', {}], queryFn: () => api.get<ServiceCard[]>('/catalog/services') });
  const query = { ...range, status, barberId: barberId || undefined, serviceId: serviceId || undefined, method: method || undefined, origin: origin || undefined, q: search || undefined, page };
  const { data, isLoading } = useQuery({ queryKey: ['admin-orders', query], queryFn: () => api.get<List>('/admin/orders', query), placeholderData: keepPreviousData, refetchInterval: 30_000 });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <>
      <AdminHeader url="/pedidos" title="Pedidos">
        <SearchBox value={q} onChange={reset(setQ)} placeholder="Buscar código, cliente…" />
        <a className="btn sm dark" href={api.url('/admin/orders.csv', { ...query, page: undefined })}>
          <Icon name="download" size="s" />
          Exportar CSV
        </a>
      </AdminHeader>
      <main className="acontent">
        <div className="filters">
          <DateRange from={range.from} to={range.to} onChange={reset(setRange)} />
          <SelectFilter label="Profissional" value={barberId} onChange={reset(setBarberId)} options={[{ value: '', label: 'Todos' }, ...(barbers ?? []).map((b) => ({ value: b.id, label: b.name }))]} />
          <SelectFilter label="Serviço" value={serviceId} onChange={reset(setServiceId)} options={[{ value: '', label: 'Todos' }, ...(services ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
          <SelectFilter
            label="Pagamento"
            value={method}
            onChange={reset(setMethod)}
            options={[
              { value: '', label: 'Todos' },
              { value: 'PIX', label: 'Pix' },
              { value: 'CREDIT', label: 'Crédito' },
              { value: 'DEBIT', label: 'Débito' },
              { value: 'CASH', label: 'Dinheiro' },
              { value: 'COUNTER', label: 'Recebido no balcão' },
            ]}
          />
          <SelectFilter label="Origem" value={origin} onChange={reset(setOrigin)} options={[{ value: '', label: 'Site e avulso' }, { value: 'SITE', label: 'Site' }, { value: 'WALK_IN', label: 'Avulso' }]} />
          <span className="sp" />
          <span className="xs muted">
            {data?.total ?? 0} pedidos · {money(data?.totalCents ?? 0)}
          </span>
        </div>
        <ChipGroup
          className="filters !overflow-visible"
          label="Status"
          value={status}
          onChange={reset(setStatus)}
          options={(
            [
              ['ALL', 'Todos'],
              ['CART', 'No carrinho'],
              ['AWAITING_PAYMENT', 'Aguardando pagamento'],
              ['PAID', 'Pago'],
              ['COMPLETED', 'Concluído'],
              ['CANCELLED', 'Cancelado'],
            ] as [Status, string][]
          ).map(([value, label]) => ({ value, label, count: data?.counts[value] ?? '' }))}
        />
        {isLoading ? (
          <Skeleton className="h-96" />
        ) : (
          <Reveal deps={[page, status]} className="tbl">
            <table className="t min-w-[960px]">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>Itens</th>
                  <th>Profissional</th>
                  <th>Horário</th>
                  <th>Pagamento</th>
                  <th>Status</th>
                  <th className="r">Valor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.items.map((r) => (
                  <tr key={r.id}>
                    <td className="code">{r.code}</td>
                    <td>{r.customerName}</td>
                    <td className="max-w-[260px] truncate">{r.itemsLabel}</td>
                    <td>{r.barberName}</td>
                    <td>{r.scheduledStart ? compactDateTime(r.scheduledStart) : '—'}</td>
                    <td>{r.paymentLabel}</td>
                    <td>
                      <StatusBadge status={r.displayStatus} label={r.displayStatus === 'LATE' ? 'Atrasada' : r.displayLabel} />
                    </td>
                    <td className="r b">{money2(r.totalCents)}</td>
                    <td>
                      <Link href={`/admin/pedidos/${r.code}`} aria-label={`Abrir pedido ${r.code}`} className="muted">
                        <Icon name="chev" size="s" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && !data.items.length ? <p className="xs muted center py-8">Nenhum pedido com esses filtros.</p> : null}
          </Reveal>
        )}
        {data ? <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
      </main>
    </>
  );
}
