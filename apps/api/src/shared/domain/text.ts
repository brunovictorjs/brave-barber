import { randomUUID } from 'node:crypto';

/** Identificador gerado pela aplicação (o agregado nasce com id). */
export function newId(): string {
  return randomUUID().replace(/-/g, '');
}

/** "Platinar o cabelo" → "platinar-o-cabelo" */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** "Lucas Reis" → "LR" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
  return (first + last).toUpperCase();
}
