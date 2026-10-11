'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { CatalogTabs } from '@/components/admin/catalog-tabs';
import { AdminHeader, SearchBox, SelectFilter } from '@/components/admin/shell';
import { Photo } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { Reveal } from '@/components/motion/motion';
import { Skeleton } from '@/components/ui/controls';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api, errorMessage } from '@/lib/api';
import { duration, money2, rating } from '@/lib/format';
import { useCategories } from '@/lib/queries';
import type { OfferBadge, ServiceCard } from '@/lib/types';

interface AdminService extends ServiceCard {
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  offer: OfferBadge | null;
  mediaSummary: string;
}

const STATUS = {
  ACTIVE: { cls: 'badge ok dot', label: 'Ativo' },
  DRAFT: { cls: 'badge n dot', label: 'Rascunho' },
  ARCHIVED: { cls: 'badge bad dot', label: 'Arquivado' },
};

/** Catálogo de serviços (tela 37). */
export default function ServicesAdminPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'DRAFT' | 'ARCHIVED'>('ACTIVE');
  const [inOffer, setInOffer] = useState<'' | 'yes' | 'no'>('');
  const search = useDeferredValue(q);
  const { data: categories } = useCategories('SERVICE');
  const query = { q: search || undefined, category: category || undefined, status: status || undefined, inOffer: inOffer || undefined };
  const { data, isLoading } = useQuery({ queryKey: ['admin-services', query], queryFn: () => api.get<AdminService[]>('/admin/services', query), placeholderData: keepPreviousData });

  const setServiceStatus = useMutation({
    mutationFn: (v: { id: string; status: AdminService['status'] }) => api.patch(`/admin/services/${v.id}/status`, { status: v.status }),
    onSuccess: () => {
      toast.success('Situação atualizada');
      void qc.invalidateQueries({ queryKey: ['admin-services'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <AdminHeader url="/servicos" title="Serviços">
        <SearchBox value={q} onChange={setQ} placeholder="Buscar serviço…" width={130} />
        <Link className="btn sm primary" href="/admin/servicos/novo">
          <Icon name="plus" size="s" />
          Novo serviço
        </Link>
      </AdminHeader>
      <main className="acontent">
        <CatalogTabs />
        <div className="filters">
          <SelectFilter label="Categoria" value={category} onChange={setCategory} options={[{ value: '', label: 'Todas' }, ...(categories ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
          <SelectFilter label="Situação" value={status} onChange={setStatus} options={[{ value: '', label: 'Todas' }, { value: 'ACTIVE', label: 'Ativos' }, { value: 'DRAFT', label: 'Rascunhos' }, { value: 'ARCHIVED', label: 'Arquivados' }]} />
          <SelectFilter label="Em oferta" value={inOffer} onChange={setInOffer} options={[{ value: '', label: 'Indiferente' }, { value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]} />
          <span className="sp" />
          <span className="xs muted">{data?.length ?? 0} serviços</span>
        </div>
        {isLoading ? (
          <Skeleton className="h-96" />
        ) : (
          <Reveal className="tbl" deps={[JSON.stringify(query)]}>
            <table className="t min-w-[860px]">
              <thead>
                <tr>
                  <th style={{ width: '36%' }}>Serviço</th>
                  <th>Categoria</th>
                  <th className="r">Duração</th>
                  <th className="r">Preço</th>
                  <th className="r">Vendidos</th>
                  <th className="r">Nota</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data?.map((s) => (
                  <tr key={s.id} style={s.status !== 'ACTIVE' ? { opacity: 0.65 } : undefined}>
                    <td>
                      <Link className="rowx" href={`/admin/servicos/${s.id}`}>
                        <Photo url={s.coverUrl} icon={s.icon} iconSize="s" className="h-[38px] w-[38px] flex-[0_0_38px]" />
                        <span>
                          <span className="b block">{s.name}</span>
                          <span className="xs muted">{s.mediaSummary || 'sem fotos'}</span>
                        </span>
                      </Link>
                    </td>
                    <td>{s.categoryName}</td>
                    <td className="r">{duration(s.durationMin)}</td>
                    <td className="r">{money2(s.listPriceCents)}</td>
                    <td className="r">{s.sold}</td>
                    <td className="r">{rating(s.rating.average)}</td>
                    <td>{s.offer && s.status === 'ACTIVE' ? <span className="badge warn dot">Em oferta</span> : <span className={STATUS[s.status].cls}>{STATUS[s.status].label}</span>}</td>
                    <td>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="ibtn !h-8 !w-8 !border-transparent" aria-label={`Ações de ${s.name}`}>
                          <Icon name="more" size="s" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/servicos/${s.id}`}>
                              <Icon name="edit" size="s" /> Editar
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/servicos/${s.slug}`} target="_blank">
                              <Icon name="eye" size="s" /> Ver no site
                            </Link>
                          </DropdownMenuItem>
                          {s.status !== 'ACTIVE' ? (
                            <DropdownMenuItem onSelect={() => setServiceStatus.mutate({ id: s.id, status: 'ACTIVE' })}>
                              <Icon name="check" size="s" /> Publicar
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => setServiceStatus.mutate({ id: s.id, status: 'DRAFT' })}>
                              <Icon name="eye" size="s" /> Voltar para rascunho
                            </DropdownMenuItem>
                          )}
                          {s.status !== 'ARCHIVED' ? (
                            <DropdownMenuItem onSelect={() => setServiceStatus.mutate({ id: s.id, status: 'ARCHIVED' })}>
                              <Icon name="trash" size="s" /> Arquivar
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && !data.length ? <p className="xs muted center py-8">Nenhum serviço com esses filtros.</p> : null}
          </Reveal>
        )}
      </main>
    </>
  );
}
