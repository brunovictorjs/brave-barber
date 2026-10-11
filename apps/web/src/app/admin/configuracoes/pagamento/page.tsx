'use client';

import { useQuery } from '@tanstack/react-query';
import { SettingsPage, useSettingsSection } from '@/components/admin/settings';
import { Icon } from '@/components/brand/icon';
import { Field, Input, Switch } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { money2, parseMoney } from '@/lib/format';

interface PaymentSettings {
  methods: { pix: boolean; credit: boolean; debit: boolean; cash: boolean; boleto: boolean };
  maxInstallments: number;
  minInstallmentCents: number;
  cancellationFeeCents: number;
  autoRefund: boolean;
  manualRefundOutsideWindow: boolean;
  payoutSchedule: string;
}

const METHODS: [keyof PaymentSettings['methods'], string, string, string][] = [
  ['pix', 'Pix', 'confirma em segundos · taxa 1,19%', 'pix'],
  ['credit', 'Cartão de crédito', 'taxa 3,99% + R$ 0,39', 'card'],
  ['debit', 'Cartão de débito', 'taxa 2,39%', 'card'],
  ['cash', 'Dinheiro no balcão', 'fora do Stripe · sem taxa · o cliente agenda e paga na barbearia', 'money'],
  ['boleto', 'Boleto', 'compensação lenta demais para agendamento', 'receipt'],
];

/** Pagamento e Stripe (tela 46). */
export default function PaymentSettingsPage() {
  const { draft, update, dirty, save, updatedAt, loading } = useSettingsSection<PaymentSettings>('payment');
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: () => api.get<{ payments: string }>('/health') });
  const stripe = health?.payments === 'stripe';

  return (
    <SettingsPage slug="pagamento" dirty={dirty} updatedAt={updatedAt} onSave={() => draft && save.mutate(draft)} saving={save.isPending} loading={loading}>
      {draft ? (
        <div className="cols">
          <div className="min-w-0" style={{ flex: '1.3 1 420px' }}>
            <section className="card mb-3.5">
              <div className="rowx mb-4">
                <h2 className="s b m-0">Conta Stripe</h2>
                <span className="sp" />
                <span className={stripe ? 'badge ok dot' : 'badge warn dot'}>{stripe ? 'Conectada' : 'Modo simulado'}</span>
              </div>
              <div className="rowx m mb-[9px]">
                <span className="muted">País e moeda</span>
                <span className="sp" />
                <span>Brasil · BRL</span>
              </div>
              <div className="rowx m mb-[9px]">
                <span className="muted">Ambiente</span>
                <span className="sp" />
                <span className="badge warn">{stripe ? 'Definido pela chave' : 'Sem chave'}</span>
              </div>
              <div className="rowx m">
                <span className="muted">Repasse</span>
                <span className="sp" />
                <span>{draft.payoutSchedule}</span>
              </div>
              <div className="divider" />
              <p className="xs muted leading-relaxed">
                {stripe
                  ? 'As chaves ficam nas variáveis de ambiente do servidor (STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET). Configure o webhook para /api/webhooks/stripe.'
                  : 'Sem STRIPE_SECRET_KEY o sistema usa um gateway simulado: o Pix é aprovado ao verificar e o cartão aceita números de teste. Configure as chaves para receber de verdade.'}
              </p>
              <div className="rowx mt-3">
                <a className="btn sm dark" href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">
                  <Icon name="ext" size="s" />
                  Abrir painel do Stripe
                </a>
              </div>
            </section>
            <section className="card mb-3.5">
              <h2 className="s b mb-1.5 mt-0">Formas aceitas</h2>
              <div className="list">
                {METHODS.map(([key, name, sub, icon]) => (
                  <div className="li" key={key}>
                    <Icon name={icon} />
                    <div className="flex-1">
                      <div className={draft.methods[key] ? 's b' : 's b muted'}>{name}</div>
                      <div className="xs muted mt-0.5">{sub}</div>
                    </div>
                    <Switch checked={draft.methods[key]} onCheckedChange={(v) => update({ methods: { ...draft.methods, [key]: v } })} aria-label={name} disabled={key === 'boleto'} />
                  </div>
                ))}
              </div>
              <div className="divider" />
              <div className="g2">
                <Field label="Parcelamento no crédito">
                  <div className="input">
                    <span className="xs muted">até</span>
                    <input type="number" min={1} max={12} value={draft.maxInstallments} onChange={(e) => update({ maxInstallments: Number(e.target.value) })} aria-label="Parcelas" />
                    <span className="xs muted">x sem juros</span>
                  </div>
                </Field>
                <Field label="Valor mínimo da parcela">
                  <Input defaultValue={money2(draft.minInstallmentCents)} key={`min-${draft.minInstallmentCents}`} onBlur={(e) => update({ minInstallmentCents: parseMoney(e.target.value) ?? 0 })} />
                </Field>
              </div>
            </section>
            <section className="card">
              <h2 className="s b mb-3.5 mt-0">Webhooks</h2>
              <div className="stack">
                <div className="card flex items-center gap-[11px] !bg-[#0a0a0a] !px-[13px] !py-[11px]">
                  <span className={stripe ? 'badge ok dot' : 'badge n dot'}>{stripe ? 'Ativo' : 'Inativo'}</span>
                  <div className="flex-1">
                    <div className="code s">payment_intent.succeeded</div>
                    <div className="xs muted mt-[3px]">marca o pedido como Pago</div>
                  </div>
                </div>
                <div className="card flex items-center gap-[11px] !bg-[#0a0a0a] !px-[13px] !py-[11px]">
                  <span className={stripe ? 'badge ok dot' : 'badge n dot'}>{stripe ? 'Ativo' : 'Inativo'}</span>
                  <div className="flex-1">
                    <div className="code s">charge.refunded</div>
                    <div className="xs muted mt-[3px]">confirma o estorno do pedido cancelado</div>
                  </div>
                </div>
              </div>
            </section>
          </div>
          <div className="min-w-0" style={{ flex: '1 1 280px' }}>
            <section className="card note mb-3.5">
              <h2 className="s b mb-3 mt-0">Política de reembolso</h2>
              <Field label="Taxa de cancelamento" className="mb-3">
                <Input defaultValue={money2(draft.cancellationFeeCents)} key={`fee-${draft.cancellationFeeCents}`} onBlur={(e) => update({ cancellationFeeCents: parseMoney(e.target.value) ?? 0 })} />
              </Field>
              <div className="rowx m py-[9px]">
                <span className="muted flex-1">Estorno automático ao cancelar</span>
                <Switch checked={draft.autoRefund} onCheckedChange={(v) => update({ autoRefund: v })} aria-label="Estorno automático ao cancelar" />
              </div>
              <div className="rowx m py-[9px]">
                <span className="muted flex-1">Permitir estorno manual fora do prazo</span>
                <Switch checked={draft.manualRefundOutsideWindow} onCheckedChange={(v) => update({ manualRefundOutsideWindow: v })} aria-label="Permitir estorno manual fora do prazo" />
              </div>
              <p className="xs muted mt-2.5 leading-relaxed">O prazo do reembolso integral fica em Horário de funcionamento › Tolerância de atraso. O estorno fora do prazo exige um administrador e fica registrado com o nome de quem autorizou.</p>
            </section>
            <section className="card">
              <h2 className="s b mb-3 mt-0">Chaves</h2>
              <div className="rowx items-start gap-2.5">
                <Icon name="lock" />
                <p className="xs muted leading-relaxed">A chave secreta nunca sai do servidor e não aparece nesta tela. A publicável vai no front em NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.</p>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </SettingsPage>
  );
}
