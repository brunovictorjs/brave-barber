'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { AdminHeader, Pager, SearchBox, SelectFilter, useStaffMe } from '@/components/admin/shell';
import { Avatar } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { Reveal } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Field, Input, Skeleton } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api, errorMessage } from '@/lib/api';
import { count, rate, rating } from '@/lib/format';
import type { Avatar as AvatarData, Role } from '@/lib/types';
import { cn } from '@/lib/utils';

type Tab = 'staff' | 'receptionists' | 'clients' | 'admins';

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: AvatarData;
  roles: Role[];
  active: boolean;
  lastAccess: string | null;
  invited: boolean;
  served?: number;
  rating?: number | null;
  serviceBps?: number;
  productBps?: number;
  headline?: string;
  profileStatus?: 'complete' | 'missing_about';
  orders?: number;
  lateCount?: number;
  since?: string;
}

interface Users {
  tab: Tab;
  counts: Record<Tab, number>;
  total: number;
  page: number;
  pageSize: number;
  items: UserRow[];
}

const TABS: [Tab, string][] = [
  ['staff', 'Funcionários'],
  ['receptionists', 'Balconistas'],
  ['clients', 'Clientes'],
  ['admins', 'Administradores'],
];

const ROLE_LABEL: Record<Role, string> = { CLIENT: 'Cliente', BARBER: 'Funcionário', RECEPTIONIST: 'Balconista', ADMIN: 'Administrador' };

/** Usuários e papéis (tela 40). */
export default function UsersPage() {
  const me = useStaffMe();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('staff');
  const [q, setQ] = useState('');
  const [active, setActive] = useState<'true' | 'false'>('true');
  const [page, setPage] = useState(1);
  const [inviting, setInviting] = useState(false);
  const search = useDeferredValue(q);
  const query = { q: search || undefined, active, page };
  const { data, isLoading } = useQuery({ queryKey: ['admin-users', tab, query], queryFn: () => api.get<Users>(`/admin/users/${tab}`, query), placeholderData: keepPreviousData });

  const update = useMutation({
    mutationFn: (v: { id: string; roles?: Role[]; active?: boolean }) => api.patch(`/admin/users/${v.id}`, v),
    onSuccess: () => {
      toast.success('Usuário atualizado');
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const roleMenu = (u: UserRow) => {
    const toggle = (r: Role) => update.mutate({ id: u.id, roles: u.roles.includes(r) ? u.roles.filter((x) => x !== r) : [...u.roles, r] });
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="ibtn !h-8 !w-8 !border-transparent" aria-label={`Ações de ${u.name}`}>
          <Icon name="more" size="s" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(['BARBER', 'RECEPTIONIST', 'ADMIN', 'CLIENT'] as Role[]).map((r) => (
            <DropdownMenuItem key={r} onSelect={() => toggle(r)} disabled={u.id === me.id && r === 'ADMIN'}>
              {u.roles.includes(r) ? <Icon name="check" size="s" /> : <span className="w-4" />}
              {ROLE_LABEL[r]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => update.mutate({ id: u.id, active: !u.active })} disabled={u.id === me.id}>
            <Icon name={u.active ? 'lock' : 'check'} size="s" />
            {u.active ? 'Desativar acesso' : 'Reativar acesso'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const person = (u: UserRow) => (
    <div className="rowx">
      <Avatar data={u.avatar} size={34} />
      <div>
        <div className="b">
          {u.name}
          {u.invited ? <span className="badge n ml-2 !h-[18px] !text-[9px]">Convidado</span> : null}
        </div>
        <div className="xs muted">{u.email}</div>
      </div>
    </div>
  );

  return (
    <>
      <AdminHeader url="/usuarios" title="Usuários">
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Buscar nome ou e-mail…" />
        <Button size="sm" onClick={() => setInviting(true)}>
          <Icon name="plus" size="s" />
          Convidar
        </Button>
      </AdminHeader>
      <main className="acontent">
        <div className="tabs" role="tablist">
          {TABS.map(([t, label]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={cn(tab === t && 'on')}
              onClick={() => {
                setTab(t);
                setPage(1);
              }}
            >
              {label} <span className="muted font-normal">{data ? count(data.counts[t]) : ''}</span>
            </button>
          ))}
        </div>
        <div className="filters">
          <SelectFilter label="Situação" value={active} onChange={(v) => { setActive(v); setPage(1); }} options={[{ value: 'true', label: 'Ativos' }, { value: 'false', label: 'Desativados' }]} />
          <span className="sp" />
          <span className="xs muted">
            {data?.total ?? 0} {TABS.find((t) => t[0] === tab)![1].toLowerCase()}
          </span>
        </div>
        {isLoading || !data ? (
          <Skeleton className="h-72" />
        ) : (
          <Reveal className="tbl" deps={[tab, page]}>
            {tab === 'staff' ? (
              <table className="t min-w-[900px]">
                <thead>
                  <tr>
                    <th style={{ width: '28%' }}>Pessoa</th>
                    <th>Perfil público</th>
                    <th className="r">Atend.</th>
                    <th className="r">Nota</th>
                    <th className="r">Comissão</th>
                    <th>Papel</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id}>
                      <td>{person(u)}</td>
                      <td>
                        {u.profileStatus === 'complete' ? (
                          <span className="badge ok dot">Completo</span>
                        ) : (
                          <span className="badge warn dot">Sem "sobre mim"</span>
                        )}
                      </td>
                      <td className="r">{u.served}</td>
                      <td className="r">{rating(u.rating)}</td>
                      <td className="r">
                        {u.serviceBps !== undefined && u.serviceBps !== null ? rate(u.serviceBps) : '—'}
                        <span className="xs muted"> · {u.productBps !== undefined && u.productBps !== null ? rate(u.productBps) : '—'}</span>
                      </td>
                      <td>
                        {u.roles
                          .filter((r) => r !== 'CLIENT')
                          .map((r) => (
                            <span key={r} className={cn('chip sm mr-1', r === 'ADMIN' && 'on')}>
                              {ROLE_LABEL[r]}
                            </span>
                          ))}
                      </td>
                      <td>{roleMenu(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : tab === 'clients' ? (
              <table className="t min-w-[760px]">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Celular</th>
                    <th className="r">Pedidos</th>
                    <th className="r">Atrasos</th>
                    <th>Cliente desde</th>
                    <th>Papel</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id}>
                      <td>{person(u)}</td>
                      <td>{u.phone ?? '—'}</td>
                      <td className="r">{u.orders}</td>
                      <td className="r">{u.lateCount ? <span className="badge warn">{u.lateCount}</span> : 0}</td>
                      <td>{u.since}</td>
                      <td>
                        <span className="chip sm">Cliente</span>
                      </td>
                      <td>{roleMenu(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : tab === 'receptionists' ? (
              <table className="t min-w-[860px]">
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>Pessoa</th>
                    <th>Vê no sistema</th>
                    <th>Pode fazer</th>
                    <th>Último acesso</th>
                    <th>Papel</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id}>
                      <td>{person(u)}</td>
                      <td className="!whitespace-normal">Pedidos, Agenda, Avaliações, Serviços, Categorias, Ofertas</td>
                      <td className="!whitespace-normal">Baixa de pagamento, pedido avulso, entrega de produto</td>
                      <td>{u.lastAccess ?? 'nunca entrou'}</td>
                      <td>
                        <span className="chip sm">Balconista</span>
                      </td>
                      <td>{roleMenu(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="t min-w-[600px]">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Último acesso</th>
                    <th>Papel</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id}>
                      <td>{person(u)}</td>
                      <td>{u.lastAccess ?? 'nunca entrou'}</td>
                      <td>
                        <span className="chip sm on">Administrador</span>
                      </td>
                      <td>{roleMenu(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!data.items.length ? <p className="xs muted center py-8">Ninguém aqui ainda.</p> : null}
          </Reveal>
        )}
        {tab === 'staff' ? (
          <section className="card note mt-[18px]">
            <div className="rowx items-start gap-2.5">
              <Icon name="alert" />
              <p className="xs muted leading-[1.65]">
                A seção &quot;Quem vai te atender&quot; da landing usa foto, nome e &quot;sobre mim&quot; destes cadastros. Quem está com <b className="text-[var(--ink)]">perfil incompleto</b> não aparece na vitrine. Os percentuais de comissão ficam em Configurações › Comissões.
              </p>
            </div>
          </section>
        ) : null}
        {tab === 'receptionists' ? (
          <section className="card note mt-[18px]">
            <div className="rowx items-start gap-2.5">
              <Icon name="lock" />
              <p className="xs muted leading-[1.65]">A balconista cadastra serviços, produtos e ofertas, gerencia pedidos e agendas e responde avaliações. Ela vê valores e totais dos pedidos, mas não acessa Painel, Vendas, Usuários nem Configurações.</p>
            </div>
          </section>
        ) : null}
        {data ? <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
      </main>
      <InviteDialog open={inviting} onOpenChange={setInviting} defaultRole={tab === 'receptionists' ? 'RECEPTIONIST' : tab === 'admins' ? 'ADMIN' : tab === 'clients' ? 'CLIENT' : 'BARBER'} />
    </>
  );
}

function InviteDialog({ open, onOpenChange, defaultRole }: { open: boolean; onOpenChange: (v: boolean) => void; defaultRole: Role }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [headline, setHeadline] = useState('');
  const [roles, setRoles] = useState<Role[]>([defaultRole]);
  const invite = useMutation({
    mutationFn: () => api.post<{ existed: boolean }>('/admin/users', { email, firstName: first, lastName: last, roles, headline: roles.includes('BARBER') ? headline : undefined }),
    onSuccess: (r) => {
      toast.success(r.existed ? 'Papéis adicionados ao usuário existente' : 'Convite criado · a pessoa entra com o Google usando este e-mail');
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      onOpenChange(false);
      setEmail('');
      setFirst('');
      setLast('');
      setHeadline('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) setRoles([defaultRole]);
      }}
    >
      <DialogContent>
        <DialogTitle className="disp mb-1 pr-10 text-[20px]">Convidar pessoa</DialogTitle>
        <DialogDescription className="xs muted mb-4">Ela entra com a conta Google deste e-mail e já cai na área do papel escolhido.</DialogDescription>
        <div className="stack gap-3">
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <div className="g2">
            <Field label="Nome">
              <Input value={first} onChange={(e) => setFirst(e.target.value)} />
            </Field>
            <Field label="Sobrenome">
              <Input value={last} onChange={(e) => setLast(e.target.value)} />
            </Field>
          </div>
          <div className="field">
            <span>Papéis</span>
            <div className="flex flex-wrap gap-1.5">
              {(['BARBER', 'RECEPTIONIST', 'ADMIN'] as Role[]).map((r) => {
                const on = roles.includes(r);
                return (
                  <button key={r} type="button" className={cn('chip', on && 'on')} aria-pressed={on} onClick={() => setRoles(on ? roles.filter((x) => x !== r) : [...roles, r])}>
                    {ROLE_LABEL[r]}
                  </button>
                );
              })}
            </div>
          </div>
          {roles.includes('BARBER') ? (
            <Field label="Chamada no perfil" hint="ex.: Degradê e navalha">
              <Input value={headline} onChange={(e) => setHeadline(e.target.value)} />
            </Field>
          ) : null}
          <Button onClick={() => invite.mutate()} loading={invite.isPending} disabled={!email.includes('@') || first.trim().length < 2 || !roles.length}>
            Enviar convite
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
