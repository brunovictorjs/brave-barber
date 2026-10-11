import { initials } from './text';

const VARIANTS = ['a', 'b', 'c', 'd', 'e'] as const;
export type AvatarVariant = (typeof VARIANTS)[number];

/** Avatar sem foto: iniciais + uma das cinco texturas metálicas do design system. */
export interface AvatarView {
  initials: string;
  variant: AvatarVariant;
  url: string | null;
}

export function avatarFor(person: { id: string; firstName?: string; lastName?: string; name?: string; avatarUrl?: string | null }): AvatarView {
  const name = person.name ?? `${person.firstName ?? ''} ${person.lastName ?? ''}`;
  let hash = 0;
  for (const ch of person.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { initials: initials(name), variant: VARIANTS[hash % VARIANTS.length]!, url: person.avatarUrl ?? null };
}

export function fullName(u: { firstName: string; lastName: string }): string {
  return `${u.firstName} ${u.lastName}`.trim();
}
