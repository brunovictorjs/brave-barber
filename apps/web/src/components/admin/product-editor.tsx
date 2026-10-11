'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { Field, Input, Skeleton, Switch } from '@/components/ui/controls';
import { api, ApiError, errorMessage } from '@/lib/api';
import { money2, parseMoney } from '@/lib/format';
import { useCategories } from '@/lib/queries';
import type { ProductCard } from '@/lib/types';
import { cn } from '@/lib/utils';
import { MarkdownEditor } from './markdown-editor';
import { MediaGrid } from './media-grid';
import { AdminHeader } from './shell';

interface ProductForm {
  name: string;
  categoryId: string;
  priceCents: number;
  detail: string;
  description: string;
  icon: string;
  highlight: string | null;
  available: boolean;
  sellOnline: boolean;
  barbersCanSell: boolean;
  mediaUrls: string[];
}

const EMPTY: ProductForm = { name: '', categoryId: '', priceCents: 0, detail: '', description: '', icon: 'bag', highlight: null, available: true, sellOnline: true, barbersCanSell: true, mediaUrls: [] };
const ICONS = ['bag', 'drop', 'beard', 'spark', 'razor'];

/** Editor de produto (tela 38b). */
export function ProductEditor({ id }: { id?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: existing } = useQuery({ queryKey: ['admin-product', id], queryFn: () => api.get<ProductCard & { slug: string }>(`/admin/products/${id}`), enabled: !!id });
  const { data: categories } = useCategories('PRODUCT');
  const [form, setForm] = useState<ProductForm>(EMPTY);
  const [price, setPrice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        categoryId: existing.categoryId,
        priceCents: existing.priceCents,
        detail: existing.detail,
        description: existing.description,
        icon: existing.icon,
        highlight: existing.highlight,
        available: existing.available,
        sellOnline: existing.sellOnline,
        barbersCanSell: existing.barbersCanSell,
        mediaUrls: existing.mediaUrls,
      });
      setPrice(money2(existing.priceCents));
    }
  }, [existing]);
  useEffect(() => {
    if (!id && categories?.length && !form.categoryId) setForm((f) => ({ ...f, categoryId: categories[0]!.id }));
  }, [categories, id, form.categoryId]);

  const set = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, priceCents: parseMoney(price) ?? 0, highlight: form.highlight?.trim() || null };
      return id ? api.put<{ id: string }>(`/admin/products/${id}`, body) : api.post<{ id: string }>('/admin/products', body);
    },
    onSuccess: (res) => {
      toast.success('Produto salvo');
      setDirty(false);
      setErrors({});
      void qc.invalidateQueries({ queryKey: ['admin-products'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
      if (!id) router.replace('/admin/produtos');
      else void qc.invalidateQueries({ queryKey: ['admin-product', res.id] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      toast.error(errorMessage(e));
    },
  });

  if (id && !existing) {
    return (
      <>
        <AdminHeader url="/produtos" title="Carregando…" back="/admin/produtos" />
        <main className="acontent">
          <Skeleton className="h-96" />
        </main>
      </>
    );
  }

  const options: [keyof ProductForm, string, string][] = [
    ['available', 'Disponível', 'aparece para compra no site e nos barbeiros'],
    ['sellOnline', 'Vender pelo site', 'cliente compra e retira no balcão'],
    ['barbersCanSell', 'Barbeiros podem lançar', 'no atendimento e no pedido avulso'],
  ];

  return (
    <>
      <AdminHeader url={`/produtos/${existing?.slug ?? 'novo'}`} title={id ? 'Editar produto' : 'Novo produto'} back="/admin/produtos">
        <span className="xs muted">{dirty ? 'alterações não salvas' : id ? 'salvo' : ''}</span>
        <Button variant="dark" size="sm" onClick={() => router.push('/admin/produtos')}>
          Cancelar
        </Button>
        <Button size="sm" onClick={() => save.mutate()} loading={save.isPending}>
          Salvar produto
        </Button>
      </AdminHeader>
      <main className="acontent">
        <div className="cols">
          <div className="min-w-0" style={{ flex: '1.5 1 440px' }}>
            <section className="card mb-3.5">
              <h2 className="s b mb-3.5 mt-0">Produto</h2>
              <div className="stack gap-3">
                <Field label="Nome" error={errors.name}>
                  <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus={!id} />
                </Field>
                <div className="g2">
                  <Field label="Tipo">
                    <select className="input" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                      {categories?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Preço de venda" error={errors.priceCents}>
                    <Input value={price} inputMode="decimal" placeholder="R$ 0,00" onChange={(e) => { setPrice(e.target.value); setDirty(true); }} onBlur={() => setPrice(money2(parseMoney(price) ?? 0))} />
                  </Field>
                </div>
                <div className="g2">
                  <Field label="Detalhe do card" hint="ex.: efeito seco · 120 g">
                    <Input value={form.detail} onChange={(e) => set('detail', e.target.value)} />
                  </Field>
                  <Field label="Selo (opcional)" hint="ex.: Mais vendido">
                    <Input value={form.highlight ?? ''} onChange={(e) => set('highlight', e.target.value)} />
                  </Field>
                </div>
                <div className="field">
                  <span>Ícone (sem foto)</span>
                  <div className="flex flex-wrap gap-1.5">
                    {ICONS.map((ic) => (
                      <button key={ic} type="button" className={cn('ibtn !h-9 !w-9 !rounded-[4px]', form.icon === ic && '!border-[#f2f2f2] !bg-[#f2f2f2] !text-[#0a0a0a]')} aria-pressed={form.icon === ic} aria-label={ic} onClick={() => set('icon', ic)}>
                        <Icon name={ic} size="s" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            <section className="card mb-3.5">
              <h2 className="s b mb-3 mt-0">Descrição detalhada</h2>
              <MarkdownEditor value={form.description} onChange={(v) => set('description', v)} variant="service" minHeight={220} />
              <p className="xs muted mt-2">Aparece na página do produto. Use títulos para organizar (ex.: Como usar), listas para itens com check e citações (&gt;) para avisos.</p>
            </section>
            <section className="card">
              <h2 className="s b mb-3.5 mt-0">Fotos</h2>
              <MediaGrid value={form.mediaUrls.map((url) => ({ url, kind: 'IMAGE' as const }))} onChange={(v) => set('mediaUrls', v.map((m) => m.url))} allowVideo={false} folder="products" columns={4} max={8} />
            </section>
          </div>
          <div className="min-w-0" style={{ flex: '1 1 280px' }}>
            <section className="card mb-3.5">
              <h2 className="s b mb-1.5 mt-0">Venda</h2>
              {options.map(([key, label, desc]) => (
                <div key={key} className="rowx m items-start py-2.5">
                  <span className="flex-1">
                    <span className="s b block">{label}</span>
                    <span className="xs muted mt-0.5 block">{desc}</span>
                  </span>
                  <Switch checked={form[key] as boolean} onCheckedChange={(v) => set(key, v as never)} aria-label={label} />
                </div>
              ))}
            </section>
            <section className="card note">
              <div className="rowx items-start gap-2.5">
                <Icon name="info" />
                <p className="xs muted leading-[1.65]">Sem controle de estoque: quando acabar, desligue Disponível e o produto aparece como Indisponível no site.</p>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
