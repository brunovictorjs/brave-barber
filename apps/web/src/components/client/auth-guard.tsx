'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { hasRole, useMe } from '@/lib/session';
import type { Me, Role } from '@/lib/types';
import { Skeleton } from '@/components/ui/controls';

/**
 * Exige login (e, opcionalmente, papéis). Visitante vai para /entrar e volta
 * para a mesma página depois de entrar.
 */
export function RequireAuth({ roles, children, fallback }: { roles?: Role[]; children: (me: Me) => React.ReactNode; fallback?: React.ReactNode }) {
  const { data: me, isLoading } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = me && (!roles || hasRole(me, 'ADMIN', ...roles));

  useEffect(() => {
    if (isLoading) return;
    if (!me) router.replace(`/entrar?next=${encodeURIComponent(pathname)}`);
    else if (!allowed) router.replace('/');
  }, [isLoading, me, allowed, router, pathname]);

  if (isLoading || !me || !allowed) {
    return (
      fallback ?? (
        <div className="body flex flex-col gap-3 pt-6">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      )
    );
  }
  return <>{children(me)}</>;
}

/** Redireciona para o login preservando a página atual. */
export function useLoginRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  return () => router.push(`/entrar?next=${encodeURIComponent(pathname)}`);
}
