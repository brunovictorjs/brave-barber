'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { SettingsPage, useSettingsSection } from '@/components/admin/settings';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { Field, Input, Switch } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api';
import { brDate, dateKey, longDate } from '@/lib/format';
import { DateInput } from '@/components/ui/date-input';

interface WeekdayHours {
  weekday: number;
  open: string | null;
  close: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  chairs: number;
}
interface Scheduling {
  slotIntervalMin: number;
  minAdvanceMin: number;
  horizonDays: number;
  bufferMin: number;
  refundCutoffMin: number;
  fitInMaxLateMin: number;
  pixHoldMin: number;
  cardHoldMin: number;
}
interface Closure {
  id: string;
  startsOn: string;
  endsOn: string;
  reason: string;
}

const NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Horário de funcionamento, regras da agenda e tolerância de atraso (tela 45). */
export default function HoursSettingsPage() {
  const qc = useQueryClient();
  const hours = useSettingsSection<{ weekly: WeekdayHours[] }>('hours');
  const rules = useSettingsSection<Scheduling>('scheduling');
  const { data: closures } = useQuery({ queryKey: ['closures'], queryFn: () => api.get<Closure[]>('/admin/settings/closures') });
  const [adding, setAdding] = useState(false);
  const [closure, setClosure] = useState({ startsOn: dateKey(), endsOn: dateKey(), reason: '' });

  const addClosure = useMutation({
    mutationFn: () => api.post('/admin/settings/closures', closure),
    onSuccess: () => {
      toast.success('Fechamento adicionado · esses dias saem da agenda');
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ['closures'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const removeClosure = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/settings/closures/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['closures'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const day = (i: number, patch: Partial<WeekdayHours>) =>
    hours.update((d) => ({ weekly: d.weekly.map((w) => (w.weekday === i ? { ...w, ...patch } : w)) }));
  const saveAll = async () => {
    if (hours.dirty && hours.draft) await hours.save.mutateAsync(hours.draft);
    if (rules.dirty && rules.draft) await rules.save.mutateAsync(rules.draft);
  };
  const num = (key: keyof Scheduling, label: string, suffix: string) => (
    <Field label={label}>
      <div className="input">
        <input type="number" value={rules.draft?.[key] ?? 0} onChange={(e) => rules.update({ [key]: Number(e.target.value) } as Partial<Scheduling>)} aria-label={label} />
        <span className="xs muted">{suffix}</span>
      </div>
    </Field>
  );

  return (
    <SettingsPage
      slug="horario"
      dirty={hours.dirty || rules.dirty}
      updatedAt={hours.updatedAt ?? rules.updatedAt}
      onSave={() => void saveAll()}
      saving={hours.save.isPending || rules.save.isPending}
      loading={hours.loading || rules.loading}
    >
      {hours.draft && rules.draft ? (
        <div className="cols">
          <section className="card min-w-0" style={{ flex: '1.3 1 420px' }}>
            <div className="rowx mb-4">
              <h2 className="s b m-0">Semana padrão</h2>
              <span className="sp" />
              <Link className="xs muted underline" href="/admin/configuracoes/equipe">
                vale para a casa toda · horário de cada profissional
              </Link>
            </div>
            <div className="tbl">
              <table className="t min-w-[560px]">
                <thead>
                  <tr>
                    <th style={{ width: '22%' }}>Dia</th>
                    <th>Aberto</th>
                    <th>Abre</th>
                    <th>Fecha</th>
                    <th>Intervalo</th>
                    <th className="r">Cadeiras</th>
                  </tr>
                </thead>
                <tbody>
                  {hours.draft.weekly.map((w) => {
                    const open = !!w.open;
                    return (
                      <tr key={w.weekday}>
                        <td className={open ? 'b' : 'muted'}>{NAMES[w.weekday]}</td>
                        <td>
                          <Switch
                            checked={open}
                            onCheckedChange={(v) => day(w.weekday, v ? { open: '09:00', close: '20:00', chairs: 3 } : { open: null, close: null, breakStart: null, breakEnd: null, chairs: 0 })}
                            aria-label={`${NAMES[w.weekday]} aberto`}
                          />
                        </td>
                        {open ? (
                          <>
                            <td>
                              <input className="fsel code w-[92px]" type="time" value={w.open ?? ''} onChange={(e) => day(w.weekday, { open: e.target.value })} aria-label="Abre" />
                            </td>
                            <td>
                              <input className="fsel code w-[92px]" type="time" value={w.close ?? ''} onChange={(e) => day(w.weekday, { close: e.target.value })} aria-label="Fecha" />
                            </td>
                            <td>
                              {w.breakStart ? (
                                <span className="rowx gap-1">
                                  <input className="fsel code w-[84px]" type="time" value={w.breakStart} onChange={(e) => day(w.weekday, { breakStart: e.target.value })} aria-label="Início do intervalo" />
                                  –
                                  <input className="fsel code w-[84px]" type="time" value={w.breakEnd ?? ''} onChange={(e) => day(w.weekday, { breakEnd: e.target.value })} aria-label="Fim do intervalo" />
                                  <button type="button" className="ibtn !h-7 !w-7" aria-label="Sem intervalo" onClick={() => day(w.weekday, { breakStart: null, breakEnd: null })}>
                                    <Icon name="close" size="s" className="!h-3 !w-3" />
                                  </button>
                                </span>
                              ) : (
                                <button type="button" className="more" onClick={() => day(w.weekday, { breakStart: '12:30', breakEnd: '13:30' })}>
                                  sem intervalo · adicionar
                                </button>
                              )}
                            </td>
                            <td className="r">
                              <input className="fsel w-16 text-right" type="number" min={1} max={20} value={w.chairs} onChange={(e) => day(w.weekday, { chairs: Number(e.target.value) })} aria-label="Cadeiras" />
                            </td>
                          </>
                        ) : (
                          <>
                            <td colSpan={3}>
                              <span className="badge n dot">Fechado</span>
                            </td>
                            <td className="r muted">—</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="divider" />
            <div className="rowx mb-3">
              <h2 className="s b m-0">Fechamentos previstos</h2>
              <span className="sp" />
              <button type="button" className="btn sm dark" onClick={() => setAdding(true)}>
                <Icon name="plus" size="s" />
                Adicionar data
              </button>
            </div>
            <div className="stack">
              {closures?.map((c) => (
                <div key={c.id} className="card flex items-center gap-[11px] !bg-[#0e0e0e] !px-[13px] !py-[11px]">
                  <Icon name="cal" />
                  <div className="flex-1">
                    <div className="s b">{c.startsOn === c.endsOn ? longDate(c.startsOn) : `${brDate(c.startsOn)} a ${brDate(c.endsOn)}`}</div>
                    <div className="xs muted mt-0.5">{c.reason}</div>
                  </div>
                  <button type="button" className="ibtn !h-8 !w-8" aria-label={`Remover ${c.reason}`} onClick={() => removeClosure.mutate(c.id)}>
                    <Icon name="trash" size="s" />
                  </button>
                </div>
              ))}
              {closures && !closures.length ? <p className="xs muted">Nenhum fechamento previsto.</p> : null}
            </div>
          </section>
          <div className="min-w-0" style={{ flex: '1 1 280px' }}>
            <section className="card mb-3.5">
              <h2 className="s b mb-3.5 mt-0">Regras da agenda</h2>
              <div className="stack gap-3">
                {num('slotIntervalMin', 'Intervalo entre horários', 'minutos')}
                {num('minAdvanceMin', 'Antecedência mínima para agendar', 'minutos')}
                {num('horizonDays', 'Até quando o cliente pode marcar', 'dias à frente')}
                {num('bufferMin', 'Folga entre atendimentos', 'minutos')}
                {num('pixHoldMin', 'Horário segurado aguardando o Pix', 'minutos')}
              </div>
            </section>
            <section className="card note">
              <h2 className="s b mb-3 mt-0">Tolerância de atraso</h2>
              <div className="stack gap-3">
                {num('refundCutoffMin', 'Reembolso integral até', 'min após o horário')}
                {num('fitInMaxLateMin', 'Entra na fila de encaixe até', 'min de atraso')}
              </div>
              <p className="xs muted mt-3 leading-relaxed">Passados os {rules.draft.fitInMaxLateMin} minutos o pedido vira falta: segue pago, sem reembolso e sem encaixe no dia.</p>
            </section>
          </div>
        </div>
      ) : null}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogTitle className="disp mb-1 pr-10 text-[20px]">Fechamento previsto</DialogTitle>
          <DialogDescription className="xs muted mb-4">Feriado, recesso ou evento: esses dias deixam de aparecer na agenda do site.</DialogDescription>
          <div className="stack gap-3">
            <div className="g2">
              <Field label="De">
                <DateInput className="w-full" value={closure.startsOn} onChange={(v) => setClosure({ ...closure, startsOn: v, endsOn: v > closure.endsOn ? v : closure.endsOn })} aria-label="De" />
              </Field>
              <Field label="Até">
                <DateInput className="w-full" value={closure.endsOn} min={closure.startsOn} onChange={(v) => setClosure({ ...closure, endsOn: v })} aria-label="Até" />
              </Field>
            </div>
            <Field label="Motivo">
              <Input value={closure.reason} onChange={(e) => setClosure({ ...closure, reason: e.target.value })} placeholder="Feriado · casa fechada o dia todo" />
            </Field>
            <Button onClick={() => addClosure.mutate()} loading={addClosure.isPending} disabled={closure.reason.trim().length < 2}>
              Adicionar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
}
