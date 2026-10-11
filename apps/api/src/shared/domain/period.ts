import { addDays, DateKey, dayRange, parseDateKey, toDateKey, weekdayOf } from './business-time';

export type PeriodPreset = 'today' | 'week' | 'month' | 'last_month' | 'custom';

export interface Period {
  from: DateKey;
  to: DateKey; // inclusive
  start: Date;
  end: Date; // exclusivo
  days: number;
  label: string;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function periodLabel(from: DateKey, to: DateKey): string {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  if (from === to) return `${a.day} de ${MONTHS[a.month - 1]}`;
  if (a.month === b.month && a.year === b.year) return `${a.day} a ${b.day} de ${MONTHS[b.month - 1]}`;
  return `${a.day} de ${MONTHS[a.month - 1]} a ${b.day} de ${MONTHS[b.month - 1]}`;
}

export function makePeriod(from: DateKey, to: DateKey, timeZone: string): Period {
  const [f, t] = from <= to ? [from, to] : [to, from];
  const a = parseDateKey(f);
  const b = parseDateKey(t);
  const days = Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000) + 1;
  return { from: f, to: t, start: dayRange(f, timeZone).start, end: dayRange(t, timeZone).end, days, label: periodLabel(f, t) };
}

/** Converte um preset ("este mês", "semana"…) em período de datas locais. */
export function resolvePeriod(
  preset: PeriodPreset | undefined,
  custom: { from?: DateKey; to?: DateKey },
  now: Date,
  timeZone: string,
): Period {
  const today = toDateKey(now, timeZone);
  if (custom.from && custom.to) return makePeriod(custom.from, custom.to, timeZone);
  switch (preset) {
    case 'today':
      return makePeriod(today, today, timeZone);
    case 'week': {
      // Semana de sábado a sexta, como o fechamento das comissões.
      const back = (weekdayOf(today) + 1) % 7;
      return makePeriod(addDays(today, -back), today, timeZone);
    }
    case 'last_month': {
      const { year, month } = parseDateKey(today);
      const firstThis = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastPrev = addDays(firstThis, -1);
      return makePeriod(`${lastPrev.slice(0, 8)}01`, lastPrev, timeZone);
    }
    case 'month':
    default:
      return makePeriod(`${today.slice(0, 8)}01`, today, timeZone);
  }
}

/** Período imediatamente anterior, com o mesmo número de dias (para comparação). */
export function previousPeriod(p: Period, timeZone: string): Period {
  return makePeriod(addDays(p.from, -p.days), addDays(p.from, -1), timeZone);
}

export function eachDay(p: Period): DateKey[] {
  const days: DateKey[] = [];
  for (let d = p.from; d <= p.to; d = addDays(d, 1)) days.push(d);
  return days;
}
