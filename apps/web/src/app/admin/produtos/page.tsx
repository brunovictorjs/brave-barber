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
import { Skeleton, Switch } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { money2 } from '@/lib/format';
import { useCategories } from '@/lib/queries';
import type { ProductCard } from '@/lib/types';

interface AdminProduct extends ProductCard {
  soldOnline: number;
  soldByStaff: number;
}

/** Catálogo de produtos (tela 37b). */
export default function ProductsAdminPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [available, setAvailable] = useState<'' | 'yes' | 'no'>('');
  const search = useDeferredValue(q);
  const { data: categories } = useCategories('PRODUCT');
  const query = { q: search || undefined, category: category || undefined, available: available || undefined };
  const { data, isLoading } = useQuery({ queryKey: ['admin-products', query], queryFn: () => api.get<AdminProduct[]>('/admin/products', query), placeholderData: keepPreviousData });
  const toggle = useMutation({
    mutationFn: (v: { id: string; available: boolean }) => api.patch(`/admin/products/${v.id}/availability`, { available: v.available }),
    onSuccess: (_, v) => {
      toast.success(v.available ? 'Produto disponível no site' : 'Produto marcado como indisponível');
      void qc.invalidateQueries({ queryKey: ['admin-products'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const sold = (data ?? []).reduce((s, p) => s + p.soldOnline + p.soldByStaff, 0);

  return (
    <>
      <AdminHeader url="/produtos" title="Produtos">
        <SearchBox value={q} onChange={setQ} placeholder="Buscar produto…" width={130} />
        <Link className="btn sm primary" href="/admin/produtos/novo">
          <Icon name="plus" size="s" />
          Novo produto
        </Link>
      </AdminHeader>
      <main className="acontent">
        <CatalogTabs />
        <div className="filters">
          <SelectFilter label="Tipo" value={category} onChange={setCategory} options={[{ value: '', label: 'Todos' }, ...(categories ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
          <SelectFilter label="Situação" value={available} onChange={setAvailable} options={[{ value: '', label: 'Todos' }, { value: 'yes', label: 'Disponíveis' }, { value: 'no', label: 'Indisponíveis' }]} />
          <span className="sp" />
          <span className="xs muted">
            {data?.length ?? 0} produtos · {sold} vendidos
          </span>
        </div>
        {isLoading ? (
          <Skeleton className="h-96" />
        ) : (
          <Reveal className="tbl" deps={[JSON.stringify(query)]}>
            <table className="t min-w-[820px]">
              <thead>
                <tr>
                  <th style={{ width: '34%' }}>Produto</th>
                  <th>Tipo</th>
                  <th className="r">Preço</th>
                  <th className="r">Pelo site</th>
                  <th className="r">Pelos barbeiros</th>
                  <th>Situação</th>
                  <th>Disponível</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((p) => (
                  <tr key={p.id} style={!p.available ? { opacity: 0.65 } : undefined}>
                    <td>
                      <Link className="rowx" href={`/admin/produtos/${p.id}`}>
                        <Photo url={p.coverUrl} icon={p.icon} iconSize="s" className="h-[38px] w-[38px] flex-[0_0_38px]" />
                        <span>
                          <span className="b block">{p.name}</span>
                          <span className="xs muted">
                            {p.detail}
                            {p.mediaUrls.length ? ` · ${p.mediaUrls.length} ${p.mediaUrls.length === 1 ? 'foto' : 'fotos'}` : ''}
                            {!p.available ? ' · em falta' : ''}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td>{p.categoryName}</td>
                    <td className="r">{money2(p.priceCents)}</td>
                    <td className="r">{p.soldOnline}</td>
                    <td className="r">{p.soldByStaff}</td>
                    <td>
                      <span className={p.available ? 'badge ok dot' : 'badge n dot'}>{p.available ? 'Disponível' : 'Indisponível'}</span>
                    </td>
                    <td>
                      <Switch checked={p.available} onCheckedChange={(v) => toggle.mutate({ id: p.id, available: v })} aria-label={`Disponível: ${p.name}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        )}
        <section className="card note mt-[18px]">
          <div className="rowx items-start gap-2.5">
            <Icon name="info" />
            <p className="xs muted leading-[1.65]">
              Produto não tem duração: não ocupa horário na agenda nem conta no tempo de cadeira. Só as vendas lançadas pelos barbeiros, no atendimento ou no pedido avulso, pagam a{' '}
              <Link className="lnk text-[var(--ink)]" href="/admin/configuracoes/comissoes">
                comissão de produtos
              </Link>
              .
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
