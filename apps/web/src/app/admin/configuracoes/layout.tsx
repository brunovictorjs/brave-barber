'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useStaffMe } from '@/components/admin/shell';

/** Configurações: só administrador. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const me = useStaffMe();
  const router = useRouter();
  const allowed = me.roles.includes('ADMIN');
  useEffect(() => {
    if (!allowed) router.replace('/admin/balcao');
  }, [allowed, router]);
  return allowed ? <>{children}</> : null;
}
