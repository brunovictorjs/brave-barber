'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { api, ApiError } from './api';
import type { Me, Role } from './types';

/** Sessão atual. `null` = visitante (não logado). */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get<Me | null>('/auth/session')) ?? null;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

export function hasRole(me: Me | null | undefined, ...roles: Role[]): boolean {
  return !!me && me.roles.some((r) => roles.includes(r));
}

/** Para onde mandar cada pessoa depois do login. */
export function homeFor(me: Me): string {
  if (!me.onboarded) return '/perfil/identidade';
  if (me.roles.includes('ADMIN')) return '/admin';
  if (me.roles.includes('RECEPTIONIST')) return '/admin/balcao';
  if (me.roles.includes('BARBER')) return '/barbeiro';
  return '/';
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return useCallback(async () => {
    await api.post('/auth/logout');
    qc.clear();
    router.replace('/entrar');
  }, [qc, router]);
}
