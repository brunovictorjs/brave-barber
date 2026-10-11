'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Empty } from '@/components/brand/brand';
import { ShopLogo } from '@/components/brand/shop-brand';
import { Icon } from '@/components/brand/icon';
import { Body, Screen, TopNav } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { Skeleton } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { ago, relativeDateTime } from '@/lib/format';
import { useNotifications } from '@/lib/queries';
import { useQuery } from '@tanstack/react-query';
import type { StaffAgenda } from '@/lib/types';

/** Avisos do barbeiro (tela 32) com a prévia do e-mail do próximo pedido. */
export default function NoticesPage() {
  const qc = useQueryClient();
  const { data } = useNotifications();
  const { data: agenda } = useQuery({ queryKey: ['staff-agenda'], queryFn: () => api.get<StaffAgenda>('/staff/agenda') });
  const readAll = useMutation({
    mutationFn: () => api.post('/me/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const next = agenda?.current ?? agenda?.upcoming[0];

  return (
    <Screen>
      <Body>
        <TopNav
          title="Avisos"
          back="/barbeiro"
          right={
            data?.unread ? (
              <button type="button" onClick={() => readAll.mutate()} className="xs lnk cursor-pointer border-0 bg-transparent text-[var(--ink)]">
                marcar lidos
              </button>
            ) : null
          }
        />
        <Reveal>
          {next ? (
            <section className="card raised flat mb-1">
              <div className="rowx gap-[9px] border-b border-[#3a3a3a] px-[15px] py-[13px]">
                <Icon name="mail" />
                <span className="xs muted">Prévia do e-mail enviado ao barbeiro e ao admin</span>
              </div>
              <div className="px-[15px] py-4">
                <ShopLogo width={72} height={48} className="mb-2 block" />
                <div className="s b mb-1">{next.paymentChoice === 'CASH' ? 'Novo horário reservado (dinheiro)' : 'Novo pedido pago'}</div>
                <div className="xs muted mb-3.5">de avisos@bravebarber.com.br</div>
                <div className="card !bg-[#0e0e0e]">
                  <div className="rowx m mb-2">
                    <span className="muted">Cliente</span>
                    <span className="sp" />
                    <span>{next.customer.name}</span>
                  </div>
                  <div className="rowx m mb-2">
                    <span className="muted">Quando</span>
                    <span className="sp" />
                    <span>{next.scheduledStart ? relativeDateTime(next.scheduledStart) : '—'}</span>
                  </div>
                  <div className="rowx m mb-2">
                    <span className="muted">Serviços</span>
                    <span className="sp" />
                    <span className="max-w-[60%] text-right">{next.items.filter((i) => i.kind === 'SERVICE').map((i) => i.name).join(' + ')}</span>
                  </div>
                  <div className="rowx m">
                    <span className="muted">Código</span>
                    <span className="sp" />
                    <span className="code">{next.code}</span>
                  </div>
                </div>
                <Link className="btn sm primary mt-3.5 w-full" href="/barbeiro">
                  Abrir na agenda
                </Link>
              </div>
            </section>
          ) : null}
          <h2 className="sec">No app</h2>
          <div className="stack">
            {!data ? <Skeleton className="h-40" /> : null}
            {data?.items.map((n) => (
              <div key={n.id} className="card flex items-start gap-[11px]">
                <span className={`badge ${n.tone} grid !h-[34px] !w-[34px] flex-none place-items-center !rounded-full !p-0`}>
                  <Icon name={n.icon} size="s" />
                </span>
                <div className="flex-1">
                  <div className="s b">{n.title}</div>
                  <div className="xs muted mt-[3px]">{n.body}</div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="xs muted">{ago(n.createdAt)}</span>
                  {!n.read ? <span className="block h-2 w-2 rounded-full bg-[#f2f2f2]" aria-label="não lido" /> : null}
                </div>
              </div>
            ))}
            {data && !data.items.length ? <Empty icon="bell" title="Nenhum aviso por enquanto" /> : null}
          </div>
        </Reveal>
      </Body>
    </Screen>
  );
}
