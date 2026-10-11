/**
 * Datas na hora local da barbearia. O servidor pode rodar em UTC, mas a agenda
 * ("terça, 14:40") sempre é interpretada no fuso do negócio.
 *
 * Convenções: `DateKey` é "AAAA-MM-DD" na hora local; minutos do dia vão de 0 a 1439.
 */
export type DateKey = string;

export interface ZonedParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = domingo
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday as string] ?? 0,
  };
}

/** Diferença (em minutos) entre a hora local e UTC naquele instante. */
function offsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / 60_000) * 60_000) / 60_000);
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Data inválida: ${key}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Instante UTC correspondente a `dateKey` + `minutes` na hora local. */
export function zonedTime(dateKey: DateKey, minutes: number, timeZone: string): Date {
  const { year, month, day } = parseDateKey(dateKey);
  const guess = new Date(Date.UTC(year, month - 1, day, 0, minutes));
  const first = new Date(guess.getTime() - offsetMinutes(guess, timeZone) * 60_000);
  // Uma segunda passada corrige a virada de horário de verão, se houver.
  return new Date(guess.getTime() - offsetMinutes(first, timeZone) * 60_000);
}

export function toDateKey(date: Date, timeZone: string): DateKey {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function minutesOfDay(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

export function weekdayOf(key: DateKey): number {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addDays(key: DateKey, days: number): DateKey {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

export function dayRange(key: DateKey, timeZone: string): { start: Date; end: Date } {
  return { start: zonedTime(key, 0, timeZone), end: zonedTime(addDays(key, 1), 0, timeZone) };
}

/** "14:40" → 880 */
export function parseHm(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Horário inválido: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 880 → "14:40" */
export function formatHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 65 → "1h05" · 40 → "40 min" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "quarta, 7 de outubro às 14:40" */
export function formatLongDateTime(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${WEEKDAY_NAMES[p.weekday]}, ${p.day} de ${MONTH_NAMES[p.month - 1]} às ${formatHm(p.hour * 60 + p.minute)}`;
}

/** "qua, 7 out · 14:40" */
export function formatShortDateTime(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${WEEKDAY_NAMES[p.weekday].slice(0, 3)}, ${p.day} ${MONTH_NAMES[p.month - 1].slice(0, 3)} · ${formatHm(p.hour * 60 + p.minute)}`;
}
