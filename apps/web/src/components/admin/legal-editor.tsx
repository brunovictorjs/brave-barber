'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api';
import { ago, brDate, compactDateTime, count, dateKey } from '@/lib/format';
import { MarkdownEditor } from './markdown-editor';
import { SettingsPage } from './settings';

interface LegalView {
  kind: 'PRIVACY' | 'TERMS';
  published: { version: number; content: string; publishedAt: string } | null;
  draft: { version: number; content: string; editedByName: string | null; updatedAt: string } | null;
  acceptances: number;
  totalClients: number;
  history: { version: number; publishedAt: string | null; status: string }[];
}

/** Política de privacidade e termos (telas 43 e 49): rascunho, publicação e versões. */
export function LegalEditor({ kind, slug, title }: { kind: 'privacy' | 'terms'; slug: string; title: string }) {
  const qc = useQueryClient();
  const key = ['legal-admin', kind];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<LegalView>(`/admin/settings/legal/${kind}`) });
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState(false);

  useEffect(() => {
    if (data && !dirty) setContent(data.draft?.content ?? data.published?.content ?? '');
  }, [data, dirty]);

  const save = useMutation({
    mutationFn: () => api.put<LegalView>(`/admin/settings/legal/${kind}`, { content }),
    onSuccess: (v) => {
      qc.setQueryData(key, v);
      setDirty(false);
      toast.success('Rascunho salvo');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) await api.put(`/admin/settings/legal/${kind}`, { content });
      return api.post<LegalView>(`/admin/settings/legal/${kind}/publish`);
    },
    onSuccess: (v) => {
      qc.setQueryData(key, v);
      setDirty(false);
      toast.success(`Versão ${v.published?.version} publicada · novo aceite no próximo login`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const status = data?.draft || dirty ? 'Rascunho' : 'Publicado';
  return (
    <SettingsPage slug={slug} dirty={dirty} updatedAt={data?.draft?.updatedAt ?? data?.published?.publishedAt ?? null} onSave={() => save.mutate()} saving={save.isPending} loading={!data}>
      {data ? (
        <div className="cols">
          <section className="card min-w-0" style={{ flex: '1.5 1 420px' }}>
            <div className="rowx mb-3">
              <h2 className="s b m-0">{title}</h2>
              <span className="sp" />
              <span className="xs muted">{data.published ? `versão ${data.published.version} · publicada em ${brDate(dateKey(data.published.publishedAt))}` : 'ainda não publicada'}</span>
            </div>
            <MarkdownEditor
              value={content}
              onChange={(v) => {
                setContent(v);
                setDirty(true);
              }}
              minHeight={360}
            />
          </section>
          <div className="min-w-0" style={{ flex: '1 1 280px' }}>
            <section className="card mb-3.5">
              <h2 className="s b mb-3.5 mt-0">Publicação</h2>
              <div className="rowx m mb-2.5">
                <span className="muted">Situação</span>
                <span className="sp" />
                <span className={status === 'Publicado' ? 'badge ok dot' : 'badge warn dot'}>{status}</span>
              </div>
              <div className="rowx m mb-2.5">
                <span className="muted">Versão vigente</span>
                <span className="sp" />
                <span>{data.published?.version ?? '—'}</span>
              </div>
              <div className="rowx m mb-2.5">
                <span className="muted">Aceites registrados</span>
                <span className="sp" />
                <span>
                  {count(data.acceptances)} de {count(data.totalClients)}
                </span>
              </div>
              {data.draft ? (
                <div className="rowx m mb-3.5">
                  <span className="muted">Editado por</span>
                  <span className="sp" />
                  <span>
                    {data.draft.editedByName ?? '—'}, há {ago(data.draft.updatedAt)}
                  </span>
                </div>
              ) : null}
              <Button size="sm" className="mb-[9px] w-full" onClick={() => publish.mutate()} loading={publish.isPending} disabled={!data.draft && !dirty}>
                Publicar nova versão
              </Button>
              <Button variant="dark" size="sm" className="w-full" onClick={() => setHistory(true)}>
                Ver histórico de versões
              </Button>
            </section>
            <section className="card note mb-3.5">
              <div className="rowx items-start gap-2.5">
                <Icon name={kind === 'terms' ? 'shield' : 'alert'} />
                <p className="xs muted leading-[1.65]">
                  {kind === 'terms'
                    ? 'Publicar pede novo aceite no próximo login de cada cliente. O aceite guarda data, hora e número da versão — é o que te protege numa disputa de reembolso.'
                    : 'Ao publicar, pedimos novo aceite no próximo login de cada cliente. O aceite fica registrado com data e versão.'}
                </p>
              </div>
            </section>
            <section className="card">
              <h2 className="s b mb-1.5 mt-0">Onde aparece</h2>
              <div className="list">
                {['Rodapé da landing', 'Tela de login', kind === 'terms' ? 'Antes de confirmar o pagamento' : 'Perfil do cliente'].map((l) => (
                  <div className="li !py-[9px]" key={l}>
                    <Icon name="link" size="s" />
                    <span className="m flex-1">{l}</span>
                    <span className="badge ok">Ativo</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : null}
      <Dialog open={history} onOpenChange={setHistory}>
        <DialogContent>
          <DialogTitle className="disp mb-4 pr-10 text-[20px]">Histórico de versões</DialogTitle>
          <DialogDescription className="sr-only">Versões publicadas e rascunhos</DialogDescription>
          <div className="list">
            {data?.history.map((h) => (
              <div className="li" key={h.version}>
                <span className="code s">v{h.version}</span>
                <span className="flex-1 xs muted">{h.publishedAt ? `publicada em ${compactDateTime(h.publishedAt)}` : 'não publicada'}</span>
                <span className={h.status === 'PUBLISHED' ? 'badge ok' : h.status === 'DRAFT' ? 'badge warn' : 'badge n'}>{h.status === 'PUBLISHED' ? 'Vigente' : h.status === 'DRAFT' ? 'Rascunho' : 'Substituída'}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </SettingsPage>
  );
}
