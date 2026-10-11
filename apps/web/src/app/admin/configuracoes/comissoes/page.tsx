'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { SettingsPage, useSettingsSection } from '@/components/admin/settings';
import { Avatar } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { money, rate } from '@/lib/format';
import type { Avatar as AvatarData } from '@/lib/types';

interface CommissionSettings {
  defaultServiceBps: number;
  defaultProductBps: number;
  base: string;
  closing: string;
  payoutDay: string;
  rules: Record<'completed' | 'paidNotCompleted' | 'fitIn' | 'refunded' | 'barberProducts' | 'siteProducts', boolean>;
}

interface Overview {
  period: { label: string };
  rows: { id: string; name: string; avatar: AvatarData; serviceBps: number; productBps: number; appointments: number; servicesCents: number; productsCents: number; payoutCents: number }[];
  totals: { serviceCents: number; productCents: number; totalCents: number };
  categoryRules: { categoryId: string; categoryName: string; rateBps: number; reason: string }[];
  categories: { id: string; name: string }[];
}

const RULES: [keyof CommissionSettings['rules'], string][] = [
  ['completed', 'Pedido concluído'],
  ['paidNotCompleted', 'Pedido pago mas não concluído (falta)'],
  ['fitIn', 'Encaixe de cliente atrasado'],
  ['refunded', 'Pedido estornado'],
  ['barberProducts', 'Produto lançado pelo barbeiro'],
  ['siteProducts', 'Produto comprado pelo cliente no site'],
];

const pct = (v: string) => Math.round(Number(v.replace(/[^\d,.]/g, '').replace(',', '.')) * 100);

/** Comissões (tela 47): execução e produtos por profissional, exceções e regras. */
export default function CommissionSettingsPage() {
  const qc = useQueryClient();
  const settings = useSettingsSection<CommissionSettings>('commission');
  const { data: o } = useQuery({ queryKey: ['admin-commissions'], queryFn: () => api.get<Overview>('/admin/commissions', { period: 'month' }) });
  const [rates, setRates] = useState<Record<string, { serviceBps: number; productBps: number }>>({});
  const [newRule, setNewRule] = useState({ categoryId: '', rate: '45%', reason: '' });

  const saveRates = useMutation({
    mutationFn: async () => {
      for (const [id, r] of Object.entries(rates)) await api.put(`/admin/commissions/barbers/${id}`, r);
    },
    onSuccess: () => {
      setRates({});
      void qc.invalidateQueries({ queryKey: ['admin-commissions'] });
    },
  });
  const upsertRule = useMutation({
    mutationFn: () => api.put('/admin/commissions/categories', { categoryId: newRule.categoryId, rateBps: pct(newRule.rate), reason: newRule.reason }),
    onSuccess: () => {
      toast.success('Exceção salva');
      setNewRule({ categoryId: '', rate: '45%', reason: '' });
      void qc.invalidateQueries({ queryKey: ['admin-commissions'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const removeRule = useMutation({
    mutationFn: (categoryId: string) => api.delete(`/admin/commissions/categories/${categoryId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-commissions'] }),
  });

  const dirty = settings.dirty || Object.keys(rates).length > 0;
  const saveAll = async () => {
    try {
      if (settings.dirty && settings.draft) await settings.save.mutateAsync(settings.draft);
      if (Object.keys(rates).length) {
        await saveRates.mutateAsync();
        if (!settings.dirty) toast.success('Percentuais salvos');
      }
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const d = settings.draft;
  const rateOf = (row: Overview['rows'][number]) => rates[row.id] ?? { serviceBps: row.serviceBps, productBps: row.productBps };
  const usedCategories = new Set(o?.categoryRules.map((r) => r.categoryId));

  return (
    <SettingsPage slug="comissoes" dirty={dirty} updatedAt={settings.updatedAt} onSave={() => void saveAll()} saving={settings.save.isPending || saveRates.isPending} loading={settings.loading}>
      {d ? (
        <div className="cols">
          <div className="min-w-0" style={{ flex: '1.4 1 440px' }}>
            <section className="card mb-3.5">
              <div className="rowx mb-4">
                <h2 className="s b m-0">Comissão por profissional</h2>
                <span className="sp" />
                <span className="xs muted">execução sobre o serviço · produtos sobre a venda</span>
              </div>
              <div className="tbl">
                <table className="t min-w-[720px]">
                  <thead>
                    <tr>
                      <th style={{ width: '26%' }}>Profissional</th>
                      <th className="r">Execução</th>
                      <th className="r">Produtos</th>
                      <th className="r">Atend.</th>
                      <th className="r">Serviços</th>
                      <th className="r">Produtos vendidos</th>
                      <th className="r">A repassar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o?.rows.map((r) => {
                      const v = rateOf(r);
                      return (
                        <tr key={r.id}>
                          <td>
                            <div className="rowx">
                              <Avatar data={r.avatar} size={30} />
                              <span className="b">{r.name}</span>
                            </div>
                          </td>
                          <td className="r">
                            <input className="fsel b w-[72px] text-right" defaultValue={rate(v.serviceBps)} key={`s${r.id}${r.serviceBps}`} onBlur={(e) => setRates({ ...rates, [r.id]: { ...v, serviceBps: pct(e.target.value) } })} aria-label={`Execução de ${r.name}`} />
                          </td>
                          <td className="r">
                            <input className="fsel b w-[72px] text-right" defaultValue={rate(v.productBps)} key={`p${r.id}${r.productBps}`} onBlur={(e) => setRates({ ...rates, [r.id]: { ...v, productBps: pct(e.target.value) } })} aria-label={`Produtos de ${r.name}`} />
                          </td>
                          <td className="r">{r.appointments}</td>
                          <td className="r">{money(r.servicesCents)}</td>
                          <td className="r">{money(r.productsCents)}</td>
                          <td className="r b">{money(r.payoutCents)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="divider" />
              <div className="rowx m mb-1.5">
                <span className="muted">Comissão de execução · {o?.period.label}</span>
                <span className="sp" />
                <span className="num">{money(o?.totals.serviceCents ?? 0)}</span>
              </div>
              <div className="rowx m mb-2.5">
                <span className="muted">Comissão de produtos</span>
                <span className="sp" />
                <span className="num">{money(o?.totals.productCents ?? 0)}</span>
              </div>
              <div className="rowx">
                <span className="b">Total a repassar no período</span>
                <span className="sp" />
                <span className="price text-[22px]">{money(o?.totals.totalCents ?? 0)}</span>
              </div>
            </section>
            <section className="card">
              <h2 className="s b mb-3.5 mt-0">Exceção por categoria de serviço</h2>
              <p className="xs muted mb-3.5 leading-relaxed">Vale só para a comissão de execução: quando existe exceção, ela vence o percentual do profissional. Coloração custa mais produto, então a casa fica com uma fatia maior.</p>
              <div className="tbl">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Categoria</th>
                      <th className="r">Comissão</th>
                      <th>Motivo</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {o?.categoryRules.map((r) => (
                      <tr key={r.categoryId}>
                        <td className="b">{r.categoryName}</td>
                        <td className="r b">{rate(r.rateBps)}</td>
                        <td className="muted">{r.reason}</td>
                        <td className="r">
                          <button type="button" className="ibtn !h-8 !w-8" aria-label={`Remover exceção de ${r.categoryName}`} onClick={() => removeRule.mutate(r.categoryId)}>
                            <Icon name="trash" size="s" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="filters mt-3.5 !mb-0">
                <select className="fsel" value={newRule.categoryId} onChange={(e) => setNewRule({ ...newRule, categoryId: e.target.value })} aria-label="Categoria">
                  <option value="">Categoria…</option>
                  {o?.categories
                    .filter((c) => !usedCategories.has(c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                <input className="fsel w-20" value={newRule.rate} onChange={(e) => setNewRule({ ...newRule, rate: e.target.value })} aria-label="Percentual" />
                <input className="fsel flex-1" value={newRule.reason} onChange={(e) => setNewRule({ ...newRule, reason: e.target.value })} placeholder="motivo" aria-label="Motivo" />
                <Button size="sm" variant="dark" onClick={() => upsertRule.mutate()} disabled={!newRule.categoryId} loading={upsertRule.isPending}>
                  Adicionar exceção
                </Button>
              </div>
            </section>
          </div>
          <div className="min-w-0" style={{ flex: '1 1 280px' }}>
            <section className="card mb-3.5">
              <h2 className="s b mb-3.5 mt-0">Regra padrão</h2>
              <div className="stack gap-3">
                <div className="g2">
                  <Field label="Execução · novo funcionário">
                    <Input defaultValue={rate(d.defaultServiceBps)} key={`ds${d.defaultServiceBps}`} onBlur={(e) => settings.update({ defaultServiceBps: pct(e.target.value) })} />
                  </Field>
                  <Field label="Produtos · novo funcionário">
                    <Input defaultValue={rate(d.defaultProductBps)} key={`dp${d.defaultProductBps}`} onBlur={(e) => settings.update({ defaultProductBps: pct(e.target.value) })} />
                  </Field>
                </div>
                <Field label="Base de cálculo">
                  <Input value={d.base} onChange={(e) => settings.update({ base: e.target.value })} />
                </Field>
                <Field label="Fechamento">
                  <Input value={d.closing} onChange={(e) => settings.update({ closing: e.target.value })} />
                </Field>
                <Field label="Dia do repasse">
                  <Input value={d.payoutDay} onChange={(e) => settings.update({ payoutDay: e.target.value })} />
                </Field>
              </div>
            </section>
            <section className="card mb-3.5">
              <h2 className="s b mb-3 mt-0">O que entra na comissão</h2>
              {RULES.map(([key, label]) => (
                <div className="rowx m py-[9px]" key={key}>
                  <span className="muted flex-1">{label}</span>
                  <Switch checked={d.rules[key]} onCheckedChange={(v) => settings.update({ rules: { ...d.rules, [key]: v } })} aria-label={label} />
                </div>
              ))}
            </section>
            <section className="card note">
              <div className="rowx items-start gap-2.5">
                <Icon name="info" />
                <p className="xs muted leading-[1.65]">
                  Este é o número que aparece na tela{' '}
                  <Link className="lnk text-[var(--ink)]" href="/barbeiro/ganhos">
                    Meus ganhos
                  </Link>{' '}
                  do funcionário. Produto comprado pelo cliente no site não paga comissão a ninguém. Mudar o percentual só vale para atendimentos futuros — o que já foi concluído mantém a comissão vigente na data.
                </p>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </SettingsPage>
  );
}
