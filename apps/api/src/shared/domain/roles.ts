export const ROLES = ['CLIENT', 'BARBER', 'RECEPTIONIST', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  CLIENT: 'Cliente',
  BARBER: 'Funcionário',
  RECEPTIONIST: 'Balconista',
  ADMIN: 'Administrador',
};

/** Quem trabalha na casa (vê o painel administrativo em alguma medida). */
export const STAFF_ROLES: Role[] = ['BARBER', 'RECEPTIONIST', 'ADMIN'];

export function parseRoles(value: string | null | undefined): Role[] {
  if (!value) return ['CLIENT'];
  const roles = value
    .split(',')
    .map((r) => r.trim().toUpperCase())
    .filter((r): r is Role => (ROLES as readonly string[]).includes(r));
  return roles.length ? roles : ['CLIENT'];
}

export function serializeRoles(roles: Role[]): string {
  return Array.from(new Set(roles)).join(',');
}
