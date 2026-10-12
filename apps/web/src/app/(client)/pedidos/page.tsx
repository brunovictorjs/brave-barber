'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Avatar, Empty, StatusBadge } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { RequireAuth } from '@/components/client/auth-guard';
import { Body, ClientTabBar, Screen } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { Skeleton } from '@/components/ui/controls';
import { dateKey, duration, money, relativeDateTime, shortDateTime, until } from '@/lib/format';
import { useMyOrders } from '@/lib/queries';
import type { OrderView } from '@/lib/types';
import { cn } from '@/lib/utils';

function OrderCard({ o }: { o: OrderView }) {
  const services = o.items.filter((i) => i.kind === 'SERVICE');
  const title = o.items.map((i) => i.name).join(' + ');
  const highlight = o.displayStatus === 'PAID' && o.scheduledStart && dateKey(o.scheduledStart) >= dateKey();
  const past = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(o.displayStatus);

  return (
    <Link href={`/pedidos/${o.code}`} className={cn('card block', highlight && 'raised', past && 'opacity-80')} style={highlight ? { borderColor: '#9a9a9a' } : undefined} data-reveal>
      <div className="rowx mb-[11px]">
        <StatusBadge status={o.displayStatus} label={o.displayStatus === 'LATE' ? 'Pago · atrasado' : o.displayStatus === 'IN_SERVICE' ? 'Em atendimento' : o.displayLabel} />
        <span className="sp" />
        <span className={cn('code xs', past && 'muted')}>{o.code}</span>
      </div>
      <div className="s b">{title}</div>
      {o.type === 'APPOINTMENT' ? (
        <>
          <div className="rowx xs muted mb-3 mt-[7px] gap-3">
            <span>{o.scheduledStart ? (past ? shortDateTime(o.scheduledStart) : relativeDateTime(o.scheduledStart)) : '—'}</span>
            <span>{past && o.barber ? o.barber.name : duration(services.reduce((s, i) => s + i.durationMin, 0))}</span>
          </div>
          {!past ? (
            <div className="rowx">
              {o.barber ? <Avatar data={o.barber.avatar} size={28} /> : null}
              <span className="xs muted">{o.barber?.name}</span>
              <span className="sp" />
              <span className="price">{money(o.totalCents)}</span>
            </div>
          ) : null}
        </>
      ) : (
        <div className="rowx mt-2.5">
          <Icon name="bag" size="s" />
          <span className="xs muted">{o.status === 'COMPLETED' ? 'retirado no balcão' : 'retire no balcão'}</span>
          <span className="sp" />
          <span className="price">{money(o.totalCents)}</span>
        </div>
      )}
      {!past && o.type === 'APPOINTMENT' ? (
        <>
          <div className="divider" />
          <div className="rowx xs gap-[7px]">
            {o.paymentChoice === 'CASH' ? (
              <>
                <Icon name="money" size="s" />
                pague em dinheiro no balcão, depois do atendimento
              </>
            ) : o.displayStatus === 'PROCESSING' ? (
              <>
                <Icon name="clock" size="s" />
                aguardando a confirmação do pagamento
              </>
            ) : o.cancel.allowed && o.scheduledStart ? (
              <>
                <Icon name="refund" size="s" />
                {until(o.scheduledStart)} · cancelamento com reembolso disponível
              </>
            ) : o.displayStatus === 'IN_SERVICE' ? (
              <>
                <Icon name="scissor" size="s" />
                na cadeira agora · toque para ver o código de conclusão
              </>
            ) : (
              <>
                <Icon name="alert" size="s" />
                o prazo de reembolso terminou
              </>
            )}
          </div>
        </>
      ) : null}
      {o.canReview ? (
        <span className="btn sm mt-3 w-full">
          <Icon name="staro" size="s" />
          Avaliar atendimento
        </span>
      ) : null}
      {o.status === 'CANCELLED' && o.refundedCents ? <div className="xs muted mt-[7px]">Reembolso de {money(o.refundedCents)} devolvido</div> : null}
    </Link>
  );
}

function OrdersScreen() {
  const params = useSearchParams();
  const [tab, setTab] = useState<'upcoming' | 'history'>(params.get('aba') === 'historico' ? 'history' : 'upcoming');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useMyOrders(tab, page);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Body>
      <div className="topnav">
        <h1 className="ttl">Meus pedidos</h1>
      </div>
      <div className="segs mb-4" role="tablist">
        <button
          role="tab"
          type="button"
          className={cn(tab === 'upcoming' && 'on')}
          aria-selected={tab === 'upcoming'}
          onClick={() => {
            setTab('upcoming');
            setPage(1);
          }}
        >
          Próximos
        </button>
        <button
          role="tab"
          type="button"
          className={cn(tab === 'history' && 'on')}
          aria-selected={tab === 'history'}
          onClick={() => {
            setTab('history');
            setPage(1);
          }}
        >
          Histórico
        </button>
      </div>
      {isLoading ? (
        <div className="stack">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : (
        <Reveal className="glist" deps={[tab, page, data?.items.length]}>
          {data?.items.map((o) => <OrderCard key={o.id} o={o} />)}
          {data && !data.items.length ? (
            <Empty icon="cal" title={tab === 'upcoming' ? 'Nenhum horário marcado' : 'Nada no histórico ainda'}>
              {tab === 'upcoming' ? (
                <Link className="lnk" href="/catalogo">
                  Escolha um serviço e agende
                </Link>
              ) : null}
            </Empty>
          ) : null}
        </Reveal>
      )}
      {pages > 1 ? (
        <div className="rowx mb-1 mt-[18px] justify-center gap-1.5">
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} type="button" className={cn('chip min-w-9 justify-center', page === i + 1 && 'on')} aria-current={page === i + 1 ? 'page' : undefined} onClick={() => setPage(i + 1)}>
              {i + 1}
            </button>
          ))}
        </div>
      ) : null}
    </Body>
  );
}

export default function OrdersPage() {
  return (
    <Screen size="medium">
      <Suspense>
        <RequireAuth>{() => <OrdersScreen />}</RequireAuth>
      </Suspense>
      <ClientTabBar />
    </Screen>
  );
}
