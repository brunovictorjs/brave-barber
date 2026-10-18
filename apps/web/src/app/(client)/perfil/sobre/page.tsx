'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { RequireAuth } from '@/components/client/auth-guard';
import { Body, Foot, Screen, TopNav } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/controls';
import { api, ApiError, errorMessage } from '@/lib/api';
import { homeFor } from '@/lib/session';
import type { Me } from '@/lib/types';

function AboutForm({ me }: { me: Me }) {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [about, setAbout] = useState(me.about ?? '');
  const [saving, setSaving] = useState(false);
  const isStaff = me.roles.includes('BARBER');

  const finish = async (skip: boolean) => {
    setSaving(true);
    try {
      const updated = await api.put<Me>('/me/about', { about: skip ? me.about : about || null, finish: true });
      qc.setQueryData(['me'], updated);
      const next = params.get('next');
      router.replace(me.onboarded ? (isStaff ? '/barbeiro/perfil' : '/perfil') : next && next.startsWith('/') ? next : homeFor(updated));
      if (me.onboarded) toast.success('Perfil atualizado');
    } catch (e) {
      // A tela não destaca campos: mostra o motivo do primeiro campo recusado.
      const field = e instanceof ApiError && e.fields ? Object.values(e.fields)[0] : undefined;
      toast.error(field ?? errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Body>
        <TopNav title="Sobre você" back={me.onboarded ? true : '/perfil/identidade'} step={me.onboarded ? undefined : '2 de 2'} />
        <Reveal>
          <p className="m muted mb-5">Opcional para clientes. Para quem atende, é o texto que aparece no perfil público.</p>
          <label className="field mb-2">
            <span>Sobre mim</span>
            <Textarea rows={5} className="min-h-[140px]" maxLength={400} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Conte um pouco sobre você" />
          </label>
          <div className="rowx xs muted justify-between">
            <span>Aparece no seu perfil público</span>
            <span className="num">{about.length} / 400</span>
          </div>
        </Reveal>
      </Body>
      <Foot className="flex gap-2.5">
        {!me.onboarded ? (
          <Button variant="ghost" className="flex-[0_0_36%]" onClick={() => finish(true)} disabled={saving}>
            Pular
          </Button>
        ) : null}
        <Button onClick={() => finish(false)} loading={saving}>
          {me.onboarded ? 'Salvar' : 'Concluir'}
        </Button>
      </Foot>
    </>
  );
}

export default function AboutPage() {
  return (
    <Screen>
      <Suspense>
        <RequireAuth>{(me) => <AboutForm me={me} />}</RequireAuth>
      </Suspense>
    </Screen>
  );
}
