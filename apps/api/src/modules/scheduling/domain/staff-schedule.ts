import { z } from 'zod';
import { DaySchedule, Interval, shifts } from './availability';

/**
 * Agenda de cada profissional, em minutos do dia (hora local da casa).
 *
 * Por padrão o profissional trabalha no horário da casa. Ele pode ter uma
 * semana própria (ex.: terça a sábado, 14:00–18:00) e períodos avulsos que
 * abrem ou fecham a agenda dele. O horário da casa é sempre o limite: o
 * intervalo de almoço e os dias fechados valem para todos.
 */
const hm = z.string().regex(/^\d{2}:\d{2}$/, 'Use o formato HH:MM');

export const staffWeekday = z
  .object({
    weekday: z.number().int().min(0).max(6),
    start: hm.nullable(),
    end: hm.nullable(),
  })
  .refine((d) => (d.start === null) === (d.end === null), 'Informe início e fim')
  .refine((d) => !d.start || !d.end || d.start < d.end, 'O fim precisa ser depois do início');

export type StaffWeekday = z.infer<typeof staffWeekday>;

export interface StaffHours {
  custom: boolean;
  weekly: StaffWeekday[];
}

export type PeriodKind = 'OPEN' | 'CLOSED';

/** Período avulso já recortado para o dia (minutos; pode passar de 0–1440 e é limitado aqui). */
export interface DayPeriod {
  kind: PeriodKind;
  start: number;
  end: number;
}

/** Semana própria vazia: todos os dias de folga. */
export function emptyWeek(): StaffWeekday[] {
  return Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: null, end: null }));
}

function normalize(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of a) for (const y of b) out.push({ start: Math.max(x.start, y.start), end: Math.min(x.end, y.end) });
  return normalize(out);
}

function subtract(a: Interval[], cut: Interval[]): Interval[] {
  let rest = normalize(a);
  for (const c of cut) {
    rest = rest.flatMap((r) =>
      [
        { start: r.start, end: Math.min(r.end, c.start) },
        { start: Math.max(r.start, c.end), end: r.end },
      ].filter((p) => p.end > p.start),
    );
  }
  return rest;
}

const parse = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));

/**
 * Janelas em que o profissional atende no dia:
 *   (semana dele ∪ períodos abertos) ∩ turnos da casa − períodos fechados.
 */
export function workWindows(house: DaySchedule | null, weekday: number, hours: StaffHours, periods: DayPeriod[]): Interval[] {
  if (!house) return [];
  const houseShifts = shifts(house);
  let base: Interval[] = houseShifts;
  if (hours.custom) {
    const own = hours.weekly.find((w) => w.weekday === weekday);
    base = own?.start && own.end ? [{ start: parse(own.start), end: parse(own.end) }] : [];
  }
  const opened = periods.filter((p) => p.kind === 'OPEN').map((p) => ({ start: p.start, end: p.end }));
  const closed = periods.filter((p) => p.kind === 'CLOSED').map((p) => ({ start: p.start, end: p.end }));
  return subtract(intersect(normalize([...base, ...opened]), houseShifts), closed);
}
