'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { AdminHeader } from '@/components/admin/shell';
import { Empty } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { Reveal } from '@/components/motion/motion';
import { Skeleton } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { brDate, weekdayName } from '@/lib/format';

interface AdminOffer {
  id: string;
  name: string;
  label: string;
  startsOn: string;
  endsOn: string;
  weekdays: number[];
  usageLimit: number | null;
  usedCount: number;
  status: 'ACTIVE' | 'SCHEDULED' | 'ENDED';
  services: { id: string; name: string; priceCents: number }[];
}

const STATUS = { ACTIVE: ['badge warn dot', 'Ativa'], SCHEDULED: ['badge info dot', 'Agendada'], ENDED: ['badge bad dot', 'Encerrada'] } as const;

export default function OffersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-offers'], queryFn: () => api.get<AdminOffer[]>('/admin/offers') });
  const end = useMutation({
    mutationFn: (id: string) => api.post(`/admin/offers/${id}/end`),
    onSuccess: () => {
      toast.success('Oferta encerrada · os serviços voltaram ao preço de tabela');
      void qc.invalidateQueries({ queryKey: ['admin-offers'] });
      void qc.invalidateQueries({ queryKey: ['services'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <AdminHeader url="/ofertas" title="Ofertas">
        <Link className="btn sm primary" href="/admin/ofertas/nova">
          <Icon name="plus" size="s" />
          Nova oferta
        </Link>
      </AdminHeader>
      <main className="acontent">
        {isLoading ? (
          <Skeleton className="h-64" />
        ) : data?.length ? (
          <Reveal className="tbl">
            <table className="t min-w-[860px]">
              <thead>
                <tr>
                  <th>Oferta</th>
                  <th>Desconto</th>
                  <th>Período</th>
                  <th>Dias</th>
                  <th>Serviços</th>
                  <th className="r">Usos</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.map((o) => (
                  <tr key={o.id} style={o.status === 'ENDED' ? { opacity: 0.6 } : undefined}>
                    <td className="b">
                      <Link href={`/admin/ofertas/${o.id}`}>{o.name}</Link>
                    </td>
                    <td>
                      <span className="badge warn">{o.label}</span>
                    </td>
                    <td>
                      {brDate(o.startsOn)} a {brDate(o.endsOn)}
                    </td>
                    <td>{o.weekdays.length === 7 ? 'todos' : o.weekdays.map((d) => weekdayName(d).slice(0, 3)).join(', ')}</td>
                    <td className="max-w-[240px] truncate">{o.services.map((s) => s.name).join(', ')}</td>
                    <td className="r">
                      {o.usedCount}
                      {o.usageLimit ? ` / ${o.usageLimit}` : ''}
                    </td>
                    <td>
                      <span className={STATUS[o.status][0]}>{STATUS[o.status][1]}</span>
                    </td>
                    <td className="r">
                      {o.status !== 'ENDED' ? (
                        <button type="button" className="btn sm dark" onClick={() => end.mutate(o.id)} disabled={end.isPending}>
                          Encerrar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        ) : (
          <Empty icon="tag" title="Nenhuma oferta cadastrada">
            Crie um desconto para um grupo de serviços em dias e período definidos.
          </Empty>
        )}
      </main>
    </>
  );
}
