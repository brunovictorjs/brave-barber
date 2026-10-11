'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { addDaysKey, dateKey, money2, parseMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AdminHeader, SearchBox, SelectFilter } from './shell';
import { DateInput } from '@/components/ui/date-input';

interface Availability {
  free: { id: string; name: string; categoryName: string; categoryId: string; priceCents: number }[];
  taken: { id: string; name: string; offerName: string }[];
  total: number;
}

interface OfferData {
  id: string;
  name: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  usageLimit: number | null;
  startsOn: string;
  endsOn: string;
  weekdays: number[];
  services: { id: string; name: string; priceCents: number }[];
  status: string;
}

const DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Cadastro de oferta (tela 39). */
export function OfferEditor({ id }: { id?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const today = dateKey();
  const { data: existing } = useQuery({ queryKey: ['admin-offer', id], queryFn: () => api.get<OfferData>(`/admin/offers/${id}`), enabled: !!id });
  const { data: avail } = useQuery({ queryKey: ['offer-availability', id], queryFn: () => api.get<Availability>('/admin/offers/availability', { except: id }) });
  const [name, setName] = useState('');
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [discount, setDiscount] = useState('25%');
  const [limit, setLimit] = useState('');
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(addDaysKey(today, 7));
  const [days, setDays] = useState<number[]>([2, 3]);
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setType(existing.discountType);
    setDiscount(existing.discountType === 'PERCENT' ? `${existing.discountValue / 100}%` : money2(existing.discountValue));
    setLimit(existing.usageLimit ? String(existing.usageLimit) : '');
    setStartsOn(existing.startsOn);
    setEndsOn(existing.endsOn);
    setDays(existing.weekdays);
    setSelected(existing.services.map((s) => s.id));
  }, [existing]);

  const value = type === 'PERCENT' ? Math.round(Number(discount.replace(/[^\d,.]/g, '').replace(',', '.')) * 100) : parseMoney(discount) ?? 0;
  const discounted = (price: number) => (type === 'PERCENT' ? price - Math.round((price * value) / 10_000) : Math.max(0, price - value));
  const services = useMemo(() => {
    const list = [...(avail?.free ?? [])];
    for (const s of existing?.services ?? []) if (!list.some((x) => x.id === s.id)) list.push({ ...s, categoryName: '', categoryId: '' });
    return list.filter((s) => (!q || s.name.toLowerCase().includes(q.toLowerCase())) && (!cat || s.categoryName === cat));
  }, [avail, existing, q, cat]);
  const categories = [...new Set((avail?.free ?? []).map((s) => s.categoryName))];

  const save = useMutation({
    mutationFn: () => {
      const body = { name, discountType: type, discountValue: value, usageLimit: limit ? Number(limit) : null, startsOn, endsOn, weekdays: days, serviceIds: selected };
      return id ? api.put(`/admin/offers/${id}`, body) : api.post('/admin/offers', body);
    },
    onSuccess: () => {
      toast.success(id ? 'Oferta atualizada' : 'Oferta criada');
      void qc.invalidateQueries({ queryKey: ['admin-offers'] });
      void qc.invalidateQueries({ queryKey: ['services'] });
      void qc.invalidateQueries({ queryKey: ['storefront'] });
      router.push('/admin/ofertas');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <AdminHeader url={id ? `/ofertas/${id}` : '/ofertas/nova'} title={id ? 'Editar oferta' : 'Nova oferta'} back="/admin/ofertas">
        <Button variant="dark" size="sm" onClick={() => router.push('/admin/ofertas')}>
          Cancelar
        </Button>
        <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={name.trim().length < 2 || !selected.length || !days.length || value <= 0}>
          {id ? 'Salvar oferta' : 'Criar oferta'}
        </Button>
      </AdminHeader>
      <main className="acontent cols">
        <div className="min-w-0" style={{ flex: '1 1 320px' }}>
          <section className="card mb-3.5">
            <h2 className="s b mb-3.5 mt-0">Dados da oferta</h2>
            <div className="stack gap-3">
              <Field label="Nome">
                <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!id} placeholder="Combo de terça e quarta" />
              </Field>
              <div className="field">
                <span>Tipo de desconto</span>
                <div className="segs" role="radiogroup" aria-label="Tipo de desconto">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={type === 'PERCENT'}
                    className={cn(type === 'PERCENT' && 'on')}
                    onClick={() => {
                      setType('PERCENT');
                      setDiscount('25%');
                    }}
                  >
                    Percentual
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={type === 'FIXED'}
                    className={cn(type === 'FIXED' && 'on')}
                    onClick={() => {
                      setType('FIXED');
                      setDiscount('R$ 10,00');
                    }}
                  >
                    Valor fixo
                  </button>
                </div>
              </div>
              <div className="g2">
                <Field label="Desconto">
                  <Input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" />
                </Field>
                <Field label="Limite de usos">
                  <Input value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))} placeholder="sem limite" inputMode="numeric" />
                </Field>
              </div>
              <div className="g2">
                <Field label="Começa em">
                  <DateInput className="w-full" value={startsOn} onChange={(v) => { setStartsOn(v); if (v > endsOn) setEndsOn(v); }} aria-label="Começa em" />
                </Field>
                <Field label="Termina em">
                  <DateInput className="w-full" value={endsOn} min={startsOn} onChange={setEndsOn} aria-label="Termina em" />
                </Field>
              </div>
              <div className="field">
                <span>Dias válidos</span>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((d, i) => {
                    const on = days.includes(i);
                    return (
                      <button key={d} type="button" className={cn('chip', on && 'on')} aria-pressed={on} onClick={() => setDays(on ? days.filter((x) => x !== i) : [...days, i].sort())}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
          <section className="card note">
            <div className="rowx items-start gap-2.5">
              <Icon name="info" />
              <p className="xs muted leading-[1.65]">
                A lista ao lado mostra apenas serviços que <b className="text-[var(--ink)]">não estão em nenhuma oferta ativa</b>. Para reaproveitar um serviço já ofertado, encerre a oferta atual primeiro.
              </p>
            </div>
          </section>
        </div>
        <section className="card min-w-0" style={{ flex: '1.3 1 400px' }}>
          <div className="rowx mb-3.5">
            <h2 className="s b m-0">Serviços disponíveis</h2>
            <span className="sp" />
            <span className="xs muted">
              {avail ? `${avail.free.length} de ${avail.total} livres` : ''} · {selected.length} selecionados
            </span>
          </div>
          <div className="filters mb-3">
            <SearchBox value={q} onChange={setQ} placeholder="Buscar…" width={110} />
            <SelectFilter label="Categoria" value={cat} onChange={setCat} options={[{ value: '', label: 'Todas' }, ...categories.map((c) => ({ value: c, label: c }))]} />
          </div>
          <div className="tbl">
            <table className="t min-w-[440px]">
              <thead>
                <tr>
                  <th />
                  <th>Serviço</th>
                  <th>Categoria</th>
                  <th className="r">Preço</th>
                  <th className="r">Com desconto</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => {
                  const on = selected.includes(s.id);
                  return (
                    <tr key={s.id} className="cursor-pointer" onClick={() => setSelected(on ? selected.filter((x) => x !== s.id) : [...selected, s.id])}>
                      <td>
                        <span className={cn('chk', on && 'on')} role="checkbox" aria-checked={on} aria-label={`Incluir ${s.name}`}>
                          <svg aria-hidden="true">
                            <use href="#check" />
                          </svg>
                        </span>
                      </td>
                      <td className={on ? 'b' : ''}>{s.name}</td>
                      <td>{s.categoryName}</td>
                      <td className="r">{money2(s.priceCents)}</td>
                      <td className={on ? 'r b' : 'r muted'}>{money2(discounted(s.priceCents))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {avail && !services.length ? <p className="xs muted center py-6">Todos os serviços já estão em alguma oferta ativa.</p> : null}
        </section>
      </main>
    </>
  );
}
