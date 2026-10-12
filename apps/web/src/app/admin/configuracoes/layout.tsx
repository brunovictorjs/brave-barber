'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { RECEPTIONIST_TABS } from '@/components/admin/settings';
import { useStaffMe } from '@/components/admin/shell';

/** Configurações: o administrador vê tudo; a balconista, só horário e agenda da equipe. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const me = useStaffMe();
  const router = useRouter();
  const pathname = usePathname();
  const slug = pathname.split('/')[3] ?? '';
  const allowed = me.roles.includes('ADMIN') || (me.roles.includes('RECEPTIONIST') && RECEPTIONIST_TABS.includes(slug));
  useEffect(() => {
    if (!allowed) router.replace(me.roles.includes('RECEPTIONIST') ? '/admin/configuracoes/horario' : '/admin/balcao');
  }, [allowed, me.roles, router]);
  return allowed ? <>{children}</> : null;
}
