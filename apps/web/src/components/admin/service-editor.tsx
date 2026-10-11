'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { Field, Input, Skeleton, Switch, Textarea } from '@/components/ui/controls';
import { api, ApiError, errorMessage } from '@/lib/api';
import { duration, money2, parseDuration, parseMoney } from '@/lib/format';
import { useCategories } from '@/lib/queries';
import type { BarberCard, ServiceCard } from '@/lib/types';
import { cn } from '@/lib/utils';
import { MarkdownEditor } from './markdown-editor';
import { MediaGrid, type MediaItem } from './media-grid';
import { AdminHeader } from './shell';

interface ServiceForm {
  id?: string;
  slug?: string;
  name: string;
  categoryId: string;
  priceCents: number;
  durationMin: number;
  summary: string;
  description: string;
  icon: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  isNew: boolean;
  acceptsFavorites: boolean;
  barberIds: string[];
  componentIds: string[];
  media: MediaItem[];
}

const EMPTY: ServiceForm = {
  name: '',
  categoryId: '',
  priceCents: 0,
  durationMin: 30,
  summary: '',
  description: '## Como funciona\n\n\n\n## O que está incluso\n\n- \n',
  icon: 'scissor',
  status: 'DRAFT',
  isNew: true,
  acceptsFavorites: true,
  barberIds: [],
  componentIds: [],
  media: [],
};

const ICONS = ['scissor', 'beard', 'razor', 'drop', 'brow', 'spark'];

/** Editor de serviço (tela 38), para criar e editar. */
export function ServiceEditor({ id }: { id?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: existing } = useQuery({ queryKey: ['admin-service', id], queryFn: () => api.get<ServiceForm>(`/admin/services/${id}`), enabled: !!id });
  const { data: categories } = useCategories('SERVICE');
  const { data: barbers } = useQuery({ queryKey: ['catalog-barbers'], queryFn: () => api.get<BarberCard[]>('/catalog/barbers') });
  const { data: services } = useQuery({ queryKey: ['admin-services', {}], queryFn: () => api.get<ServiceCard[]>('/admin/services') });
  const [form, setForm] = useState<ServiceForm>(EMPTY);
  const [price, setPrice] = useState('');
  const [time, setTime] = useState('30 min');
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (existing) {
      setForm(existing);
      setPrice(money2(existing.priceCents));
      setTime(duration(existing.durationMin));
    }
  }, [existing]);
  useEffect(() => {
    if (!id && categories?.length && !form.categoryId) setForm((f) => ({ ...f, categoryId: categories[0]!.id }));
  }, [categories, id, form.categoryId]);

  const set = <K extends keyof ServiceForm>(k: K, v: ServiceForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };
  const category = categories?.find((c) => c.id === form.categoryId);
  const isCombo = category?.slug === 'combos';
  const componentOptions = useMemo(() => (services ?? []).filter((s) => s.id !== id && s.categorySlug !== 'combos'), [services, id]);
  const componentsTotal = componentOptions.filter((s) => form.componentIds.includes(s.id)).reduce((t, s) => t + s.listPriceCents, 0);

  const save = useMutation({
    mutationFn: (status: ServiceForm['status']) => {
      const body = {
        ...form,
        status,
        priceCents: parseMoney(price) ?? 0,
        durationMin: parseDuration(time) ?? 0,
        componentIds: isCombo ? form.componentIds : [],
      };
      return id ? api.put<{ id: string; slug: string }>(`/admin/services/${id}`, body) : api.post<{ id: string; slug: string }>('/admin/services', body);
    },
    onSuccess: (res, status) => {
      toast.success(status === 'ACTIVE' ? 'Serviço salvo e publicado' : 'Rascunho salvo');
      setDirty(false);
      setErrors({});
      void qc.invalidateQueries({ queryKey: ['admin-services'] });
      void qc.invalidateQueries({ queryKey: ['services'] });
      void qc.invalidateQueries({ queryKey: ['admin-service', res.id] });
      if (!id) router.replace(`/admin/servicos/${res.id}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      toast.error(errorMessage(e));
    },
  });

  if (id && !existing) {
    return (
      <>
        <AdminHeader url="/servicos" title="Carregando…" back="/admin/servicos" />
        <main className="acontent">
          <Skeleton className="h-96" />
        </main>
      </>
    );
  }

  return (
    <>
      <AdminHeader
        url={`/servicos/${form.slug ?? 'novo'}`}
        title={form.name || 'Novo serviço'}
        back="/admin/servicos"
        badge={dirty ? <span className="badge n">Alterações não salvas</span> : form.status === 'ACTIVE' ? <span className="badge ok dot">Publicado</span> : <span className="badge n dot">Rascunho</span>}
      >
        {form.slug ? (
          <Link className="btn sm dark" href={`/servicos/${form.slug}`} target="_blank">
            <Icon name="eye" size="s" />
            Pré-visualizar
          </Link>
        ) : null}
        <Button variant="dark" size="sm" onClick={() => save.mutate('DRAFT')} loading={save.isPending && save.variables === 'DRAFT'}>
          Salvar rascunho
        </Button>
        <Button size="sm" onClick={() => save.mutate('ACTIVE')} loading={save.isPending && save.variables === 'ACTIVE'}>
          Salvar e publicar
        </Button>
      </AdminHeader>
      <main className="acontent cols">
        <div className="min-w-0" style={{ flex: '1.55 1 440px' }}>
          <section className="card mb-3.5">
            <h2 className="s b mb-3 mt-0">Descrição detalhada</h2>
            <MarkdownEditor value={form.description} onChange={(v) => set('description', v)} variant="service" />
            <p className="xs muted mt-2">Listas viram o card “O que está incluso” e citações (&gt;) viram o aviso tracejado na página do serviço.</p>
          </section>
          <section className="card">
            <div className="rowx mb-3">
              <h2 className="s b m-0">Fotos e vídeos</h2>
              <span className="sp" />
              <span className="xs muted">arraste para reordenar · a primeira é a capa</span>
            </div>
            <MediaGrid value={form.media} onChange={(v) => set('media', v)} />
          </section>
        </div>
        <div className="min-w-0" style={{ flex: '1 1 280px' }}>
          <section className="card mb-3.5">
            <h2 className="s b mb-3.5 mt-0">Dados do serviço</h2>
            <div className="stack gap-3">
              <Field label="Nome" error={errors.name}>
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} />
              </Field>
              <Field label="Categoria">
                <select className="input" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="g2">
                <Field label="Preço" error={errors.priceCents}>
                  <Input value={price} inputMode="decimal" placeholder="R$ 0,00" onChange={(e) => { setPrice(e.target.value); setDirty(true); }} onBlur={() => setPrice(money2(parseMoney(price) ?? 0))} />
                </Field>
                <Field label="Duração" error={errors.durationMin} hint="ex.: 40 min, 1h05">
                  <Input value={time} onChange={(e) => { setTime(e.target.value); setDirty(true); }} onBlur={() => setTime(duration(parseDuration(time) ?? 0))} />
                </Field>
              </div>
              <Field label="Resumo do card">
                <Textarea rows={2} className="min-h-16" maxLength={160} value={form.summary} onChange={(e) => set('summary', e.target.value)} />
              </Field>
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
          {isCombo ? (
            <section className="card mb-3.5">
              <h2 className="s b mb-3 mt-0">Serviços do combo</h2>
              <div className="flex flex-wrap gap-[7px]">
                {componentOptions.map((s) => {
                  const on = form.componentIds.includes(s.id);
                  return (
                    <button key={s.id} type="button" className={cn('chip', on && 'on')} aria-pressed={on} onClick={() => set('componentIds', on ? form.componentIds.filter((x) => x !== s.id) : [...form.componentIds, s.id])}>
                      {s.name}
                    </button>
                  );
                })}
              </div>
              <p className="xs muted mt-[11px] leading-relaxed">
                Quando o cliente monta esses serviços no carrinho, paga o preço do combo. Separados somam {money2(componentsTotal)}; o combo sai por {money2(parseMoney(price) ?? 0)}.
              </p>
            </section>
          ) : null}
          <section className="card mb-3.5">
            <h2 className="s b mb-3 mt-0">Quem pode executar</h2>
            <div className="flex flex-wrap gap-[7px]">
              {barbers?.map((b) => {
                const on = form.barberIds.includes(b.id);
                return (
                  <button key={b.id} type="button" className={cn('chip', on && 'on')} aria-pressed={on} onClick={() => set('barberIds', on ? form.barberIds.filter((x) => x !== b.id) : [...form.barberIds, b.id])}>
                    {b.name}
                  </button>
                );
              })}
            </div>
            <p className="xs muted mt-[11px] leading-relaxed">Só quem está marcado aparece na escolha de profissional para este serviço.</p>
          </section>
          <section className="card">
            <h2 className="s b mb-3 mt-0">Publicação</h2>
            <div className="rowx m mb-2.5">
              <span className="muted">Situação</span>
              <span className="sp" />
              <span className={form.status === 'ACTIVE' ? 'badge ok dot' : form.status === 'ARCHIVED' ? 'badge bad dot' : 'badge n dot'}>{form.status === 'ACTIVE' ? 'Ativo' : form.status === 'ARCHIVED' ? 'Arquivado' : 'Rascunho'}</span>
            </div>
            <div className="rowx m mb-2.5">
              <span className="muted">Marcar como novidade</span>
              <span className="sp" />
              <Switch checked={form.isNew} onCheckedChange={(v) => set('isNew', v)} aria-label="Marcar como novidade" />
            </div>
            <div className="rowx m">
              <span className="muted">Aceita favoritos</span>
              <span className="sp" />
              <Switch checked={form.acceptsFavorites} onCheckedChange={(v) => set('acceptsFavorites', v)} aria-label="Aceita favoritos" />
            </div>
            {id && form.status !== 'ARCHIVED' ? (
              <button type="button" className="more mt-4" onClick={() => save.mutate('ARCHIVED')}>
                arquivar serviço
              </button>
            ) : null}
          </section>
        </div>
      </main>
    </>
  );
}
