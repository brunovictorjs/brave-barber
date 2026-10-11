'use client';

import { AdminShell } from '@/components/admin/shell';
import { RequireAuth } from '@/components/client/auth-guard';
import { Skeleton } from '@/components/ui/controls';

/** Painel (desktop): administrador vê tudo; balconista vê operação e catálogo. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth
      roles={['RECEPTIONIST']}
      fallback={
        <div className="adm">
          <div className="aside" />
          <div className="amain p-6">
            <Skeleton className="mb-4 h-10 w-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      }
    >
      {(me) => <AdminShell me={me}>{children}</AdminShell>}
    </RequireAuth>
  );
}
