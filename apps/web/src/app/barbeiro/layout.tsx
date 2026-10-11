'use client';

import { RequireAuth } from '@/components/client/auth-guard';
import { Screen } from '@/components/client/shell';

/** Área do barbeiro (mobile): agenda, atendimento, ganhos e avaliações. */
export default function BarberLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <RequireAuth roles={['BARBER']} fallback={<Screen><div className="body pt-6" /></Screen>}>
        {() => <>{children}</>}
      </RequireAuth>
    </div>
  );
}
