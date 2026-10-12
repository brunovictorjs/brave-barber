'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SettingsPage } from '@/components/admin/settings';
import { Pager } from '@/components/admin/shell';
import { Avatar } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { ChipGroup, Field, Input, Skeleton, Switch } from '@/components/ui/controls';
import { DateInput } from '@/components/ui/date-input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError, errorMessage } from '@/lib/api';
import { brDate, cap, dateKey, longDate, plural } from '@/lib/format';
import type { Avatar as AvatarData } from '@/lib/types';
import { cn } from '@/lib/utils';

interface StaffWeekday {
  weekday: number;
  start: string | null;
  end: string | null;
}
interface HouseDay {
  weekday: number;
  open: string | null;
  close: string | null;
  breakStart: string | null;
  breakEnd: string | null;
}
interface Period {
  id: string;
  kind: 'OPEN' | 'CLOSED';
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  reason: string;
}
interface StaffSchedule {
  id: string;
  name: string;
  firstName: string;
  headline: string;
  avatar: AvatarData;
  custom: boolean;
  weekly: StaffWeekday[];
  periods: Period[];
}
interface Overview {
  house: HouseDay[];
  barbers: StaffSchedule[];
}
interface Conflict {
  message: string;
  orders: { code: string; customerName: string; date: string; start: string; end: string }[];
}
/** Abrir o diálogo para criar (tipo escolhido) ou editar um período existente. */
type PeriodTarget = { barber: StaffSchedule; kind: Period['kind']; period?: Period };

const NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
// Segunda primeiro: é como a casa lê a semana.
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const PERIODS_PER_PAGE = 4;

/** Erro 409 com a lista de pedidos que impedem a mudança. */
function asConflict(e: unknown): Conflict | null {
  if (!(e instanceof ApiError) || e.code !== 'schedule_conflict') return null;
  return { message: e.message, orders: (e.details?.orders as Conflict['orders']) ?? [] };
}

function houseLabel(h: HouseDay | undefined) {
  if (!h?.open || !h.close) return 'casa fechada';
  return h.breakStart && h.breakEnd ? `casa ${h.open}–${h.breakStart} · ${h.breakEnd}–${h.close}` : `casa ${h.open}–${h.close}`;
}

function periodRange(p: Period) {
  if (p.startDate === p.endDate) return `${cap(longDate(p.startDate))} · ${p.startTime}–${p.endTime}`;
  return `${brDate(p.startDate)} ${p.startTime} → ${brDate(p.endDate)} ${p.endTime}`;
}

/** Resumo do card fechado: "Horário próprio · 5 dias · 2 períodos". */
function summary(b: StaffSchedule) {
  const days = b.weekly.filter((d) => d.start).length;
  const hours = b.custom ? `Horário próprio · ${plural(days, 'dia', 'dias')}` : 'Horário da casa';
  return b.periods.length ? `${hours} · ${plural(b.periods.length, 'período', 'períodos')}` : hours;
}

/** Agenda da equipe: horário próprio de cada profissional e períodos em que a agenda fecha ou abre. */
export default function StaffSchedulesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['staff-schedules'], queryFn: () => api.get<Overview>('/admin/staff-schedules') });
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [periodFor, setPeriodFor] = useState<PeriodTarget | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <SettingsPage slug="equipe" dirty={false} updatedAt={null} onSave={() => undefined} saving={false} hideSave>
      <p className="xs muted mb-4 max-w-[720px] leading-relaxed">
        Por padrão cada profissional atende no horário de funcionamento da casa. Use o horário próprio para quem trabalha só em alguns dias ou turnos, e os períodos para folgas, férias ou um turno extra. A
        agenda do profissional nunca passa do horário da casa: intervalo e fechamentos valem para todos.
      </p>
      {isLoading || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="stack gap-2.5">
          {data.barbers.map((b) => (
            <BarberCard
              key={b.id}
              barber={b}
              house={data.house}
              expanded={open.has(b.id)}
              onToggle={() => toggle(b.id)}
              onConflict={setConflict}
              onPeriod={(kind, period) => setPeriodFor({ barber: b, kind, period })}
            />
          ))}
          {!data.barbers.length ? <p className="xs muted center py-8">Nenhum profissional ativo.</p> : null}
        </div>
      )}
      {periodFor ? <PeriodDialog target={periodFor} onClose={() => setPeriodFor(null)} onConflict={setConflict} /> : null}
      <Dialog open={!!conflict} onOpenChange={(v) => !v && setConflict(null)}>
        <DialogContent>
          <DialogTitle className="disp mb-1 pr-10 text-[20px]">Há clientes marcados</DialogTitle>
          <DialogDescription className="xs muted mb-4">{conflict?.message}</DialogDescription>
          <div className="stack gap-2">
            {conflict?.orders.map((o) => (
              <Link key={o.code} href={`/admin/pedidos/${o.code}`} className="card flex items-center gap-[11px] !bg-[#0e0e0e] !px-[13px] !py-[11px] hover:border-[#f2f2f2]">
                <Icon name="cal" />
                <div className="min-w-0 flex-1">
                  <div className="s b truncate">{o.customerName}</div>
                  <div className="xs muted mt-0.5">
                    {cap(longDate(o.date))} · {o.start}–{o.end} · <span className="code">{o.code}</span>
                  </div>
                </div>
                <Icon name="chev" size="s" />
              </Link>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
}

function BarberCard({
  barber,
  house,
  expanded,
  onToggle,
  onConflict,
  onPeriod,
}: {
  barber: StaffSchedule;
  house: HouseDay[];
  expanded: boolean;
  onToggle: () => void;
  onConflict: (c: Conflict) => void;
  onPeriod: (kind: Period['kind'], period?: Period) => void;
}) {
  const qc = useQueryClient();
  const [custom, setCustom] = useState(barber.custom);
  const [weekly, setWeekly] = useState(barber.weekly);
  const [page, setPage] = useState(1);
  const dirty = custom !== barber.custom || JSON.stringify(weekly) !== JSON.stringify(barber.weekly);
  useEffect(() => {
    setCustom(barber.custom);
    setWeekly(barber.weekly);
  }, [barber]);
  // Depois de remover o último período da página, volta para a anterior.
  const pages = Math.max(1, Math.ceil(barber.periods.length / PERIODS_PER_PAGE));
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  const visible = barber.periods.slice((page - 1) * PERIODS_PER_PAGE, page * PERIODS_PER_PAGE);

  const save = useMutation({
    mutationFn: () => api.put(`/admin/staff-schedules/${barber.id}/hours`, { custom, weekly }),
    onSuccess: () => {
      toast.success(`Horário de ${barber.firstName} salvo`);
      void qc.invalidateQueries({ queryKey: ['staff-schedules'] });
      void qc.invalidateQueries({ queryKey: ['admin-agenda'] });
    },
    onError: (e) => {
      const c = asConflict(e);
      if (c) onConflict(c);
      else toast.error(errorMessage(e));
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/staff-schedules/periods/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-schedules'] });
      void qc.invalidateQueries({ queryKey: ['admin-agenda'] });
    },
    onError: (e) => {
      const c = asConflict(e);
      if (c) onConflict(c);
      else toast.error(errorMessage(e));
    },
  });

  const day = (weekday: number, patch: Partial<StaffWeekday>) => setWeekly((w) => w.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  const startCustom = () => {
    // Começa da semana da casa, para só ajustar o que muda.
    if (!barber.custom && weekly.every((d) => !d.start)) {
      setWeekly(
        weekly.map((d) => {
          const h = house.find((x) => x.weekday === d.weekday);
          return { ...d, start: h?.open ?? null, end: h?.close ?? null };
        }),
      );
    }
    setCustom(true);
  };
  const bodyId = `agenda-${barber.id}`;

  return (
    <section className={cn('card min-w-0 !p-0', expanded && 'raised')}>
      <button
        type="button"
        className="rowx w-full cursor-pointer gap-3 border-0 bg-transparent px-[18px] py-[14px] text-left text-[var(--ink)]"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <Avatar data={barber.avatar} size={38} />
        <div className="min-w-0 flex-1">
          <h2 className="s b m-0 truncate">{barber.name}</h2>
          <div className="xs muted truncate">{summary(barber)}</div>
        </div>
        {dirty ? <span className="badge warn">não salvo</span> : null}
        <Icon name="down" size="s" className={cn('transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded ? (
        <div id={bodyId} className="border-t border-[var(--line)] px-[18px] pb-[18px] pt-4">
          <div className="rowx mb-4 flex-wrap gap-3">
            <span className="xs muted">{barber.headline}</span>
            <span className="sp" />
            <ChipGroup
              label={`Horário de ${barber.firstName}`}
              value={custom ? 'custom' : 'house'}
              onChange={(v) => (v === 'custom' ? startCustom() : setCustom(false))}
              options={[
                { value: 'house', label: 'Horário da casa' },
                { value: 'custom', label: 'Horário próprio' },
              ]}
            />
          </div>
          <div className="cols">
            <div className="min-w-0" style={{ flex: '1.3 1 380px' }}>
              {custom ? (
                <div className="tbl">
                  <table className="t min-w-[460px]">
                    <thead>
                      <tr>
                        <th style={{ width: '22%' }}>Dia</th>
                        <th>Trabalha</th>
                        <th>Início</th>
                        <th>Fim</th>
                        <th className="r">Casa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ORDER.map((i) => {
                        const d = weekly.find((w) => w.weekday === i)!;
                        const h = house.find((x) => x.weekday === i);
                        const houseOpen = !!h?.open;
                        const on = !!d.start;
                        return (
                          <tr key={i}>
                            <td className={on && houseOpen ? 'b' : 'muted'}>{NAMES[i]}</td>
                            <td>
                              <Switch
                                checked={on}
                                disabled={!houseOpen && !on}
                                onCheckedChange={(v) => day(i, v ? { start: h?.open ?? '09:00', end: h?.close ?? '18:00' } : { start: null, end: null })}
                                aria-label={`${barber.firstName} trabalha ${NAMES[i]}`}
                              />
                            </td>
                            {on ? (
                              <>
                                <td>
                                  <input className="fsel code w-[92px]" type="time" value={d.start ?? ''} onChange={(e) => day(i, { start: e.target.value })} aria-label={`Início ${NAMES[i]}`} />
                                </td>
                                <td>
                                  <input className="fsel code w-[92px]" type="time" value={d.end ?? ''} onChange={(e) => day(i, { end: e.target.value })} aria-label={`Fim ${NAMES[i]}`} />
                                </td>
                              </>
                            ) : (
                              <td colSpan={2}>
                                <span className="badge n dot">Folga</span>
                              </td>
                            )}
                            <td className="xs muted r">{houseLabel(h)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="card flex items-center gap-[11px] !bg-[#0e0e0e] !px-[13px] !py-[11px]">
                  <Icon name="clock" />
                  <div className="xs muted">Atende em todo o horário de funcionamento da casa.</div>
                </div>
              )}
              {dirty ? (
                <div className="rowx mt-3 gap-2">
                  <span className="sp" />
                  <button
                    type="button"
                    className="btn sm dark"
                    onClick={() => {
                      setCustom(barber.custom);
                      setWeekly(barber.weekly);
                    }}
                  >
                    Descartar
                  </button>
                  <Button size="sm" onClick={() => save.mutate()} loading={save.isPending}>
                    Salvar horário
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="min-w-0" style={{ flex: '1 1 280px' }}>
              <div className="rowx mb-3 flex-wrap gap-2">
                <h3 className="s b m-0">Períodos</h3>
                <span className="sp" />
                <button type="button" className="btn sm dark" onClick={() => onPeriod('CLOSED')}>
                  <Icon name="close" size="s" />
                  Fechar agenda
                </button>
                <button type="button" className="btn sm dark" onClick={() => onPeriod('OPEN')}>
                  <Icon name="plus" size="s" />
                  Turno extra
                </button>
              </div>
              <div className="stack">
                {visible.map((p) => (
                  <div key={p.id} className="card flex items-center gap-[11px] !bg-[#0e0e0e] !px-[13px] !py-[11px]">
                    <span className={p.kind === 'CLOSED' ? 'badge warn' : 'badge ok'}>{p.kind === 'CLOSED' ? 'Fechada' : 'Aberta'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="s b">{periodRange(p)}</div>
                      <div className="xs muted mt-0.5 truncate">{p.reason}</div>
                    </div>
                    <button type="button" className="ibtn !h-8 !w-8" aria-label={`Editar ${p.reason}`} onClick={() => onPeriod(p.kind, p)}>
                      <Icon name="edit" size="s" />
                    </button>
                    <button type="button" className="ibtn !h-8 !w-8" aria-label={`Remover ${p.reason}`} disabled={remove.isPending} onClick={() => remove.mutate(p.id)}>
                      <Icon name="trash" size="s" />
                    </button>
                  </div>
                ))}
                {!barber.periods.length ? <p className="xs muted">Nenhum período programado.</p> : null}
              </div>
              {barber.periods.length > PERIODS_PER_PAGE ? (
                <div className="mt-3">
                  <Pager page={page} pageSize={PERIODS_PER_PAGE} total={barber.periods.length} onPage={setPage} label="períodos" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PeriodDialog({ target, onClose, onConflict }: { target: PeriodTarget; onClose: () => void; onConflict: (c: Conflict) => void }) {
  const { barber, kind, period } = target;
  const qc = useQueryClient();
  const today = dateKey();
  const closing = kind === 'CLOSED';
  const editing = !!period;
  const [form, setForm] = useState(
    period
      ? { startDate: period.startDate, startTime: period.startTime, endDate: period.endDate, endTime: period.endTime, reason: period.reason }
      : { startDate: today, startTime: closing ? '00:00' : '09:00', endDate: today, endTime: closing ? '23:59' : '13:00', reason: '' },
  );
  const body = { startsAt: `${form.startDate}T${form.startTime}`, endsAt: `${form.endDate}T${form.endTime}`, reason: form.reason };
  const submit = useMutation({
    mutationFn: () => (period ? api.put(`/admin/staff-schedules/periods/${period.id}`, body) : api.post(`/admin/staff-schedules/${barber.id}/periods`, { kind, ...body })),
    onSuccess: () => {
      toast.success(editing ? 'Período atualizado' : closing ? `Agenda de ${barber.firstName} fechada no período` : `Turno extra de ${barber.firstName} aberto`);
      void qc.invalidateQueries({ queryKey: ['staff-schedules'] });
      void qc.invalidateQueries({ queryKey: ['admin-agenda'] });
      onClose();
    },
    onError: (e) => {
      const c = asConflict(e);
      if (c) onConflict(c);
      else toast.error(errorMessage(e));
    },
  });
  const invalid = form.reason.trim().length < 2 || body.endsAt <= body.startsAt;
  const title = editing
    ? closing
      ? `Editar fechamento de ${barber.firstName}`
      : `Editar turno extra de ${barber.firstName}`
    : closing
      ? `Fechar a agenda de ${barber.firstName}`
      : `Turno extra de ${barber.firstName}`;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogTitle className="disp mb-1 pr-10 text-[20px]">{title}</DialogTitle>
        <DialogDescription className="xs muted mb-4">
          {closing
            ? `Folga, férias ou consulta: nesse período ninguém consegue marcar com ${barber.firstName}. Se já houver cliente marcado, o sistema avisa antes.`
            : 'Abre horários fora da semana do profissional, sempre dentro do horário de funcionamento da casa.'}
        </DialogDescription>
        <div className="stack gap-3">
          <div className="g2">
            <Field label="De">
              <DateInput className="w-full" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v, endDate: v > form.endDate ? v : form.endDate })} aria-label="Data inicial" />
            </Field>
            <Field label="Às">
              <input className="input code" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} aria-label="Hora inicial" />
            </Field>
          </div>
          <div className="g2">
            <Field label="Até">
              <DateInput className="w-full" value={form.endDate} min={form.startDate} onChange={(v) => setForm({ ...form, endDate: v })} aria-label="Data final" />
            </Field>
            <Field label="Às">
              <input className="input code" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} aria-label="Hora final" />
            </Field>
          </div>
          <Field label="Motivo">
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={closing ? 'Férias · consulta médica · folga' : 'Cobrir a manhã de sábado'} />
          </Field>
          <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={invalid}>
            {editing ? 'Salvar alterações' : closing ? 'Fechar agenda' : 'Abrir turno'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
