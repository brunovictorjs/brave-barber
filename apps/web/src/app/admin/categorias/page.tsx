'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AdminHeader } from '@/components/admin/shell';
import { Icon } from '@/components/brand/icon';
import { Reveal } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Field, Input, Skeleton } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, errorMessage } from '@/lib/api';
import type { Category } from '@/lib/types';
import { cn } from '@/lib/utils';

const ICONS = ['scissor', 'beard', 'razor', 'drop', 'brow', 'spark', 'bag', 'tag'];

/** Categorias de serviços e tipos de produto. */
export default function CategoriesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-categories'], queryFn: () => api.get<Category[]>('/admin/categories') });
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  const [removing, setRemoving] = useState<Category | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-categories'] });
    void qc.invalidateQueries({ queryKey: ['categories'] });
  };
  const save = useMutation({
    mutationFn: (c: Partial<Category>) => {
      const body = { name: c.name, kind: c.kind, icon: c.icon ?? 'scissor' };
      return c.id ? api.put(`/admin/categories/${c.id}`, body) : api.post('/admin/categories', body);
    },
    onSuccess: () => {
      toast.success('Categoria salva');
      setEditing(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reorder = useMutation({
    mutationFn: (v: { kind: 'SERVICE' | 'PRODUCT'; ids: string[] }) => api.put('/admin/categories/order', v),
    onSuccess: refresh,
    onError: (e) => {
      toast.error(errorMessage(e));
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/categories/${id}`),
    onSuccess: () => {
      toast.success('Categoria apagada');
      setRemoving(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const groups: { kind: 'SERVICE' | 'PRODUCT'; title: string; hint: string }[] = [
    { kind: 'SERVICE', title: 'Categorias de serviço', hint: 'Aparecem como filtros no catálogo e organizam relatórios e comissões.' },
    { kind: 'PRODUCT', title: 'Tipos de produto', hint: 'Filtros da aba Produtos do catálogo.' },
  ];

  return (
    <>
      <AdminHeader url="/categorias" title="Categorias">
        <Button size="sm" onClick={() => setEditing({ kind: 'SERVICE', icon: 'scissor' })}>
          <Icon name="plus" size="s" />
          Nova categoria
        </Button>
      </AdminHeader>
      <main className="acontent">
        {isLoading ? (
          <Skeleton className="h-64" />
        ) : (
          <Reveal className="cols">
            {groups.map((g) => (
              <section key={g.kind} className="card" style={{ flex: '1 1 380px' }}>
                <div className="rowx mb-1">
                  <h2 className="s b m-0">{g.title}</h2>
                  <span className="sp" />
                  <button type="button" className="btn sm dark" onClick={() => setEditing({ kind: g.kind, icon: g.kind === 'PRODUCT' ? 'bag' : 'scissor' })}>
                    <Icon name="plus" size="s" />
                    Adicionar
                  </button>
                </div>
                <p className="xs muted mb-3">{g.hint} Arraste pela alça ou use as setas para mudar a ordem.</p>
                <SortableList
                  items={data?.filter((c) => c.kind === g.kind) ?? []}
                  onReorder={(ids) => reorder.mutate({ kind: g.kind, ids })}
                  onEdit={setEditing}
                  onRemove={setRemoving}
                />
              </section>
            ))}
          </Reveal>
        )}
      </main>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogTitle className="disp mb-4 pr-10 text-[20px]">{editing?.id ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
          <DialogDescription className="sr-only">Nome, tipo e ícone da categoria</DialogDescription>
          {editing ? (
            <div className="stack gap-3.5">
              <Field label="Nome">
                <Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
              </Field>
              <div className="field">
                <span>Tipo</span>
                <div className="segs">
                  <button type="button" className={cn(editing.kind === 'SERVICE' && 'on')} onClick={() => setEditing({ ...editing, kind: 'SERVICE' })}>
                    Serviço
                  </button>
                  <button type="button" className={cn(editing.kind === 'PRODUCT' && 'on')} onClick={() => setEditing({ ...editing, kind: 'PRODUCT' })}>
                    Produto
                  </button>
                </div>
              </div>
              <div className="field">
                <span>Ícone</span>
                <div className="flex flex-wrap gap-1.5">
                  {ICONS.map((ic) => (
                    <button key={ic} type="button" className={cn('ibtn !h-9 !w-9 !rounded-[4px]', editing.icon === ic && '!border-[#f2f2f2] !bg-[#f2f2f2] !text-[#0a0a0a]')} aria-pressed={editing.icon === ic} aria-label={ic} onClick={() => setEditing({ ...editing, icon: ic })}>
                      <Icon name={ic} size="s" />
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={() => save.mutate(editing)} loading={save.isPending} disabled={!editing.name || editing.name.trim().length < 2}>
                Salvar
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <DialogContent showClose={false}>
          <DialogTitle className="disp m-0 text-[20px]">Apagar {removing?.name}?</DialogTitle>
          <DialogDescription className="m muted mb-5 mt-3">{removing?.count ? `Ela tem ${removing.count} itens: mova-os para outra categoria antes.` : 'A categoria não tem itens e pode ser apagada.'}</DialogDescription>
          <div className="stack">
            <Button variant="danger" onClick={() => removing && remove.mutate(removing.id)} loading={remove.isPending} disabled={!!removing?.count}>
              Apagar
            </Button>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Voltar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Lista ordenável: arrastar pela alça (mouse ou toque) ou mover com as setas. */
function SortableList({ items, onReorder, onEdit, onRemove }: { items: Category[]; onReorder: (ids: string[]) => void; onEdit: (c: Category) => void; onRemove: (c: Category) => void }) {
  const [order, setOrder] = useState(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const key = items.map((c) => c.id).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setOrder(items), [key, items.map((c) => `${c.name}${c.icon}${c.count}`).join()]);

  const commit = (next: Category[]) => {
    setOrder(next);
    if (next.map((c) => c.id).join(',') !== key) onReorder(next.map((c) => c.id));
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return order;
    const next = [...order];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it!);
    return next;
  };

  // Arrasto por ponteiro: funciona com mouse, caneta e toque.
  const startDrag = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    setDragId(id);
    let current = order;
    const list = (e.currentTarget as HTMLElement).closest('[data-sortable]') as HTMLElement;
    const onMove = (ev: PointerEvent) => {
      const rows = [...list.querySelectorAll<HTMLElement>('[data-row]')];
      const from = current.findIndex((c) => c.id === id);
      const to = rows.findIndex((r) => {
        const b = r.getBoundingClientRect();
        return ev.clientY >= b.top && ev.clientY < b.bottom;
      });
      if (to !== -1 && to !== from) {
        const next = [...current];
        const [it] = next.splice(from, 1);
        next.splice(to, 0, it!);
        current = next;
        setOrder(next);
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDragId(null);
      commit(current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="list" data-sortable>
      {order.map((c, i) => (
        <div className={cn('li select-none transition-colors', dragId === c.id && 'rounded-[4px] bg-[var(--raised-2)]')} key={c.id} data-row>
          <button
            type="button"
            className="grid h-9 w-6 cursor-grab touch-none place-items-center border-0 bg-transparent p-0 text-[var(--ink-muted)] active:cursor-grabbing"
            aria-label={`Arrastar ${c.name}`}
            onPointerDown={(e) => startDrag(e, c.id)}
          >
            <svg viewBox="0 0 12 18" width="12" height="18" aria-hidden="true" fill="currentColor">
              <circle cx="3" cy="3" r="1.6" />
              <circle cx="9" cy="3" r="1.6" />
              <circle cx="3" cy="9" r="1.6" />
              <circle cx="9" cy="9" r="1.6" />
              <circle cx="3" cy="15" r="1.6" />
              <circle cx="9" cy="15" r="1.6" />
            </svg>
          </button>
          <span className="photo grid h-9 w-9 flex-[0_0_36px] place-items-center">
            <Icon name={c.icon} size="s" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="s b">{c.name}</div>
            <div className="xs muted">
              {i + 1}º · {c.count} {c.kind === 'SERVICE' ? (c.count === 1 ? 'serviço' : 'serviços') : c.count === 1 ? 'produto' : 'produtos'}
            </div>
          </div>
          <div className="flex flex-col">
            <button type="button" className="ibtn !h-[18px] !w-7 !rounded-b-none !border-b-0" aria-label={`Subir ${c.name}`} disabled={i === 0} onClick={() => commit(move(i, i - 1))}>
              <Icon name="down" size="s" className="!h-3 !w-3 rotate-180" />
            </button>
            <button type="button" className="ibtn !h-[18px] !w-7 !rounded-t-none" aria-label={`Descer ${c.name}`} disabled={i === order.length - 1} onClick={() => commit(move(i, i + 1))}>
              <Icon name="down" size="s" className="!h-3 !w-3" />
            </button>
          </div>
          <button type="button" className="ibtn !h-8 !w-8" aria-label={`Editar ${c.name}`} onClick={() => onEdit(c)}>
            <Icon name="edit" size="s" />
          </button>
          <button type="button" className="ibtn !h-8 !w-8" aria-label={`Apagar ${c.name}`} onClick={() => onRemove(c)}>
            <Icon name="trash" size="s" />
          </button>
        </div>
      ))}
    </div>
  );
}
