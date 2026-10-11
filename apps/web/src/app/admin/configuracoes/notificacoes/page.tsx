'use client';

import { useQuery } from '@tanstack/react-query';
import { SettingsPage, useSettingsSection } from '@/components/admin/settings';
import { Field, Input } from '@/components/ui/controls';
import { api } from '@/lib/api';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';

type Channel = 'staffEmail' | 'adminEmail' | 'clientPush' | 'clientEmail';
type EventKey = 'order_paid' | 'reminder' | 'customer_late' | 'fit_in' | 'service_started' | 'order_completed' | 'order_cancelled' | 'refund_completed' | 'review_received' | 'review_low' | 'daily_summary';

interface NotificationSettings {
  matrix: Record<EventKey, Record<Channel, boolean>>;
  sender: { name: string; email: string; replyTo: string };
  reminders: { firstHoursBefore: number; secondHoursBefore: number; barberMinutesBefore: number; dailySummaryAt: string };
}

const EVENTS: [EventKey, string, string][] = [
  ['order_paid', 'Pedido pago', 'assim que o Stripe confirma ou o horário em dinheiro é reservado'],
  ['reminder', 'Lembrete do atendimento', 'conforme a antecedência configurada ao lado'],
  ['customer_late', 'Cliente atrasou', 'passou do horário marcado sem check-in'],
  ['fit_in', 'Encaixe definido', 'quando a fila realoca um atrasado'],
  ['service_started', 'Atendimento iniciado', 'o barbeiro validou o código do pedido'],
  ['order_completed', 'Pedido concluído', 'fechado com o código de conclusão'],
  ['order_cancelled', 'Pedido cancelado', 'com o valor do estorno'],
  ['refund_completed', 'Estorno concluído', 'quando o dinheiro volta de fato'],
  ['review_received', 'Avaliação recebida', 'nota do serviço e do profissional'],
  ['review_low', 'Avaliação abaixo de 3', 'alerta de qualidade'],
  ['daily_summary', 'Resumo do dia seguinte', 'agenda fechada, enviada no horário ao lado'],
];
const CHANNELS: [Channel, string][] = [
  ['staffEmail', 'E-mail funcionário'],
  ['adminEmail', 'E-mail admin'],
  ['clientPush', 'Push cliente'],
  ['clientEmail', 'E-mail cliente'],
];

/** Notificações (tela 48): matriz de canais, remetente, lembretes e últimos envios. */
export default function NotificationSettingsPage() {
  const { draft, update, dirty, save, updatedAt, loading } = useSettingsSection<NotificationSettings>('notifications');
  const { data: log } = useQuery({ queryKey: ['email-log'], queryFn: () => api.get<{ id: string; event: string; to: string; subject: string; status: string; createdAt: string }[]>('/admin/notifications/log'), refetchInterval: 30_000 });

  const flip = (e: EventKey, c: Channel) => update((d) => ({ ...d, matrix: { ...d.matrix, [e]: { ...d.matrix[e], [c]: !d.matrix[e][c] } } }));
  const reminder = (key: keyof NotificationSettings['reminders'], label: string, suffix: string) => (
    <Field label={label}>
      <div className="input">
        <input
          type={key === 'dailySummaryAt' ? 'time' : 'number'}
          value={draft?.reminders[key] ?? ''}
          onChange={(e) => update((d) => ({ ...d, reminders: { ...d.reminders, [key]: key === 'dailySummaryAt' ? e.target.value : Number(e.target.value) } }))}
          aria-label={label}
        />
        <span className="xs muted">{suffix}</span>
      </div>
    </Field>
  );

  return (
    <SettingsPage slug="notificacoes" dirty={dirty} updatedAt={updatedAt} onSave={() => draft && save.mutate(draft)} saving={save.isPending} loading={loading}>
      {draft ? (
        <div className="cols">
          <section className="card min-w-0" style={{ flex: '1.6 1 460px' }}>
            <div className="rowx mb-4">
              <h2 className="s b m-0">Quem é avisado de quê</h2>
              <span className="sp" />
              <span className="xs muted">um evento pode disparar vários canais</span>
            </div>
            <div className="tbl">
              <table className="t min-w-[560px]">
                <thead>
                  <tr>
                    <th>Evento</th>
                    {CHANNELS.map(([, label]) => (
                      <th key={label} className="!whitespace-normal text-center leading-snug" style={{ width: 84 }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {EVENTS.map(([key, label, sub]) => (
                    <tr key={key}>
                      <td className="!whitespace-normal">
                        <span className="b block">{label}</span>
                        <span className="xs muted">{sub}</span>
                      </td>
                      {CHANNELS.map(([c, cl]) => (
                        <td key={c} className="text-center">
                          <button type="button" role="checkbox" aria-checked={draft.matrix[key][c]} aria-label={`${label}: ${cl}`} className={cn('chk', draft.matrix[key][c] && 'on')} onClick={() => flip(key, c)}>
                            <svg aria-hidden="true">
                              <use href="#check" />
                            </svg>
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="min-w-0" style={{ flex: '1 1 280px' }}>
            <section className="card mb-3.5">
              <h2 className="s b mb-3.5 mt-0">Remetente</h2>
              <div className="stack gap-3">
                <Field label="Nome">
                  <Input value={draft.sender.name} onChange={(e) => update((d) => ({ ...d, sender: { ...d.sender, name: e.target.value } }))} />
                </Field>
                <Field label="E-mail de envio">
                  <Input value={draft.sender.email} onChange={(e) => update((d) => ({ ...d, sender: { ...d.sender, email: e.target.value } }))} />
                </Field>
                <Field label="Responder para">
                  <Input value={draft.sender.replyTo} onChange={(e) => update((d) => ({ ...d, sender: { ...d.sender, replyTo: e.target.value } }))} />
                </Field>
              </div>
            </section>
            <section className="card mb-3.5">
              <h2 className="s b mb-3.5 mt-0">Lembretes</h2>
              <div className="stack gap-3">
                {reminder('firstHoursBefore', 'Primeiro lembrete ao cliente', 'horas antes')}
                {reminder('secondHoursBefore', 'Segundo lembrete ao cliente', 'horas antes')}
                {reminder('barberMinutesBefore', 'Aviso ao barbeiro', 'minutos antes')}
                {reminder('dailySummaryAt', 'Resumo do dia seguinte', 'todo dia')}
              </div>
            </section>
            <section className="card">
              <h2 className="s b mb-1.5 mt-0">Últimos envios</h2>
              <div className="list">
                {log?.map((l) => (
                  <div className="li !py-[9px]" key={l.id}>
                    <span className={l.status === 'SENT' ? 'badge ok dot' : l.status === 'FAILED' ? 'badge bad dot' : 'badge n dot'}>{l.status === 'SENT' ? 'Entregue' : l.status === 'FAILED' ? 'Falhou' : 'Ignorado'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="s truncate">{l.subject}</div>
                      <div className="xs muted mt-0.5 truncate">para {l.to}</div>
                    </div>
                    <span className="xs muted">{ago(l.createdAt)}</span>
                  </div>
                ))}
                {log && !log.length ? <p className="xs muted py-2">Nenhum envio ainda.</p> : null}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </SettingsPage>
  );
}
