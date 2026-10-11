'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { api, errorMessage } from '@/lib/api';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AdminHeader } from './shell';

const TABS = [
  ['dados', 'Dados da casa'],
  ['horario', 'Horário de funcionamento'],
  ['pagamento', 'Pagamento e Stripe'],
  ['comissoes', 'Comissões'],
  ['notificacoes', 'Notificações'],
  ['privacidade', 'Política de privacidade'],
  ['termos', 'Termos de serviço'],
] as const;

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="tabs" aria-label="Seções das configurações">
      {TABS.map(([slug, label]) => {
        const on = pathname.endsWith(`/${slug}`);
        return (
          <Link key={slug} href={`/admin/configuracoes/${slug}`} className={cn(on && 'on')} aria-current={on ? 'page' : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Carrega uma seção de configurações, mantém um rascunho local e salva com o
 * botão "Salvar alterações" do cabeçalho.
 */
export function useSettingsSection<T>(key: string) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['settings', key], queryFn: () => api.get<{ value: T; updatedAt: string | null }>(`/admin/settings/${key}`) });
  const [draft, setDraft] = useState<T | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (query.data && !dirty) setDraft(query.data.value);
  }, [query.data, dirty]);
  const save = useMutation({
    mutationFn: (value: T) => api.put<{ value: T }>(`/admin/settings/${key}`, value),
    onSuccess: (res) => {
      qc.setQueryData(['settings', key], { value: res.value, updatedAt: new Date().toISOString() });
      setDraft(res.value);
      setDirty(false);
      void qc.invalidateQueries({ queryKey: ['business'] });
      void qc.invalidateQueries({ queryKey: ['storefront'] });
      toast.success('Configurações salvas');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const update = (patch: Partial<T> | ((d: T) => T)) => {
    setDraft((d) => (d ? (typeof patch === 'function' ? patch(d) : { ...d, ...patch }) : d));
    setDirty(true);
  };
  return { draft, update, dirty, save, updatedAt: query.data?.updatedAt ?? null, loading: !draft };
}

export function SettingsPage({
  slug,
  dirty,
  updatedAt,
  onSave,
  saving,
  children,
  loading,
  hideSave,
}: {
  slug: string;
  dirty: boolean;
  updatedAt: string | null;
  onSave: () => void;
  saving: boolean;
  children: React.ReactNode;
  loading?: boolean;
  hideSave?: boolean;
}) {
  return (
    <>
      <AdminHeader url={`/configuracoes/${slug}`} title="Configurações do negócio">
        {!hideSave ? (
          <>
            <span className="xs muted">{dirty ? 'alterações não salvas' : updatedAt ? `salvo há ${ago(updatedAt)}` : ''}</span>
            <Button size="sm" onClick={onSave} loading={saving} disabled={!dirty}>
              Salvar alterações
            </Button>
          </>
        ) : null}
      </AdminHeader>
      <main className="acontent">
        <SettingsTabs />
        {loading ? <Skeleton className="h-96" /> : children}
      </main>
    </>
  );
}
