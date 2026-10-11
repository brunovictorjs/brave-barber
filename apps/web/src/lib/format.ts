/**
 * Formatação em pt-BR seguindo a voz do protótipo:
 * "R$ 60" (sem centavos quando redondo), "1h05", "quarta, 7 de outubro".
 * Datas sempre na hora da barbearia (America/Recife).
 */
export const TZ = 'America/Recife';

export function money(cents: number | null | undefined, opts: { forceCents?: boolean; signed?: boolean } = {}): string {
  const v = cents ?? 0;
  const abs = Math.abs(v);
  const reais = Math.floor(abs / 100);
  const rest = abs % 100;
  const int = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const frac = rest || opts.forceCents ? `,${String(rest).padStart(2, '0')}` : '';
  const sign = v < 0 || opts.signed ? '− ' : '';
  return `${sign}R$ ${int}${frac}`;
}

/** "R$ 180,00" (sempre com centavos — tabelas do admin) */
export const money2 = (cents: number | null | undefined) => money(cents, { forceCents: true });

/** Converte "R$ 1.234,56" / "45" / "45,9" em centavos. */
export function parseMoney(input: string): number | null {
  const clean = input.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

/** "2h30" / "40 min" / "90" → minutos */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  const hm = /^(\d+)\s*h\s*(\d{1,2})?/.exec(s);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0);
  const n = /^(\d+)/.exec(s);
  return n ? Number(n[1]) : null;
}

export function rate(bps: number): string {
  const v = bps / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(1).replace('.', ',')}%`;
}

export function rating(value: number | null | undefined): string {
  return value == null ? '—' : value.toFixed(1).replace('.', ',');
}

export function count(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
});
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function parts(date: Date | string): Parts {
  const d = typeof date === 'string' ? new Date(date) : date;
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { year: +p.year!, month: +p.month!, day: +p.day!, hour: +p.hour! % 24, minute: +p.minute!, weekday: WD[p.weekday!] ?? 0 };
}

export function dateKey(date: Date | string = new Date()): string {
  const p = parts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function keyParts(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  const weekday = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return { year: y!, month: m!, day: d!, weekday };
}

export function addDaysKey(key: string, days: number): string {
  const { year, month, day } = keyParts(key);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function hm(date: Date | string): string {
  const p = parts(date);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "quarta, 7 de outubro" (de uma data ou de uma chave AAAA-MM-DD) */
export function longDate(value: Date | string): string {
  const p = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? keyParts(value) : parts(value);
  return `${WEEKDAYS[p.weekday]}, ${p.day} de ${MONTHS[p.month - 1]}`;
}

/** "quarta, 7 de outubro às 14:40" */
export function longDateTime(value: Date | string): string {
  return `${longDate(value)} às ${hm(value)}`;
}

/** "Quarta, 7 out · 14:40" */
export function shortDateTime(value: Date | string): string {
  const p = parts(value);
  return `${cap(WEEKDAYS[p.weekday]!)}, ${p.day} ${MONTHS[p.month - 1]!.slice(0, 3)} · ${hm(value)}`;
}

/** "Hoje · 16:00" / "Amanhã · 09:40" / "Sexta, 9 out · 18:00" */
export function relativeDateTime(value: Date | string): string {
  const key = dateKey(value);
  const today = dateKey();
  if (key === today) return `Hoje · ${hm(value)}`;
  if (key === addDaysKey(today, 1)) return `Amanhã · ${hm(value)}`;
  return shortDateTime(value);
}

/** "07/10 14:40" */
export function compactDateTime(value: Date | string): string {
  const p = parts(value);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')} ${hm(value)}`;
}

/** "07/10/2026" de uma chave AAAA-MM-DD */
export function brDate(key: string): string {
  const { year, month, day } = keyParts(key);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

export function monthTitle(key: string): string {
  const { year, month } = keyParts(key);
  return `${cap(MONTHS[month - 1]!)} ${year}`;
}

export function weekdayName(i: number): string {
  return WEEKDAYS[i]!;
}

export function monthShort(i: number): string {
  return MONTHS[i]!.slice(0, 3);
}

/** "há 4 min", "há 2 h", "ontem" */
export function ago(value: Date | string): string {
  const diff = (Date.now() - new Date(value).getTime()) / 60_000;
  if (diff < 1) return 'agora';
  if (diff < 60) return `${Math.floor(diff)} min`;
  if (diff < 24 * 60) return `${Math.floor(diff / 60)} h`;
  if (diff < 48 * 60) return 'ontem';
  return `${Math.floor(diff / (24 * 60))} dias`;
}

/** "daqui a 2 dias" */
export function until(value: Date | string): string {
  const diffMs = new Date(value).getTime() - Date.now();
  if (diffMs < 0) return 'já passou';
  if (diffMs < 3600_000) return `daqui a ${Math.max(1, Math.round(diffMs / 60_000))} min`;
  const a = keyParts(dateKey());
  const b = keyParts(dateKey(value));
  const days = Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
  if (days === 0) return `hoje às ${hm(value)}`;
  if (days === 1) return 'amanhã';
  return `daqui a ${days} dias`;
}

/** Dias inteiros entre hoje e uma data (negativo se já passou). */
export function daysFromToday(key: string): number {
  const a = keyParts(dateKey());
  const b = keyParts(key);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

/** cronômetro: 2294 → "38:14" · 3892 → "1:04:52" */
export function clock(seconds: number, withHours = false): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h || withHours) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Celular/telefone enquanto digita: (81) 9 9999-9999 ou (81) 3344-8820. */
export function maskPhone(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  const ddd = `(${d.slice(0, 2)}) `;
  const rest = d.slice(2);
  if (d.length === 11) return `${ddd}${rest[0]} ${rest.slice(1, 5)}-${rest.slice(5)}`;
  if (rest.length <= 4) return ddd + rest;
  return `${ddd}${rest.slice(0, 4)}-${rest.slice(4)}`;
}

/** Busca sem diferenciar maiúsculas e acentos. */
export function matchText(text: string, query: string): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return !query.trim() || norm(text).includes(norm(query.trim()));
}
