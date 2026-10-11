'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useState } from 'react';
import { Avatar } from '@/components/brand/brand';
import { ShopLogo } from '@/components/brand/shop-brand';
import { Icon } from '@/components/brand/icon';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useLogout } from '@/lib/session';
import type { Me } from '@/lib/types';
import { cn } from '@/lib/utils';
import { DateInput } from '@/components/ui/date-input';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  match: (p: string) => boolean;
  roles: ('ADMIN' | 'RECEPTIONIST')[];
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Painel',
    items: [
      { href: '/admin', label: 'Visão geral', icon: 'chart', match: (p) => p === '/admin', roles: ['ADMIN'] },
      { href: '/admin/vendas', label: 'Vendas', icon: 'money', match: (p) => p.startsWith('/admin/vendas'), roles: ['ADMIN'] },
    ],
  },
  {
    group: 'Operação',
    items: [
      { href: '/admin/balcao', label: 'Balcão', icon: 'receipt', match: (p) => p.startsWith('/admin/balcao'), roles: ['RECEPTIONIST'] },
      { href: '/admin/pedidos', label: 'Pedidos', icon: 'bag', match: (p) => p.startsWith('/admin/pedidos'), roles: ['ADMIN', 'RECEPTIONIST'] },
      { href: '/admin/agenda', label: 'Agenda', icon: 'cal', match: (p) => p.startsWith('/admin/agenda'), roles: ['ADMIN', 'RECEPTIONIST'] },
      { href: '/admin/avaliacoes', label: 'Avaliações', icon: 'star', match: (p) => p.startsWith('/admin/avaliacoes'), roles: ['ADMIN', 'RECEPTIONIST'] },
    ],
  },
  {
    group: 'Catálogo',
    items: [
      { href: '/admin/servicos', label: 'Serviços', icon: 'scissor', match: (p) => p.startsWith('/admin/servicos') || p.startsWith('/admin/produtos'), roles: ['ADMIN', 'RECEPTIONIST'] },
      { href: '/admin/categorias', label: 'Categorias', icon: 'tag', match: (p) => p.startsWith('/admin/categorias'), roles: ['ADMIN', 'RECEPTIONIST'] },
      { href: '/admin/ofertas', label: 'Ofertas', icon: 'tag', match: (p) => p.startsWith('/admin/ofertas'), roles: ['ADMIN', 'RECEPTIONIST'] },
    ],
  },
  {
    group: 'Pessoas',
    items: [{ href: '/admin/usuarios', label: 'Usuários', icon: 'users', match: (p) => p.startsWith('/admin/usuarios'), roles: ['ADMIN'] }],
  },
  {
    group: 'Negócio',
    items: [{ href: '/admin/configuracoes/dados', label: 'Configurações', icon: 'cog', match: (p) => p.startsWith('/admin/configuracoes'), roles: ['ADMIN'] }],
  },
];

export function navFor(me: Me) {
  const isAdmin = me.roles.includes('ADMIN');
  return NAV.map((g) => ({
    group: g.group,
    // O admin vê tudo; o balcão também aparece para ele porque é onde se dá baixa.
    items: g.items.filter((i) => (isAdmin ? true : i.roles.includes('RECEPTIONIST'))),
  })).filter((g) => g.items.length);
}

function NavLinks({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {navFor(me).map((g) => (
        <div key={g.group} className="contents">
          <div className="grp">{g.group}</div>
          {g.items.map((i) => {
            const on = i.match(pathname);
            return (
              <Link key={i.href} href={i.href} className={cn(on && 'on')} aria-current={on ? 'page' : undefined} onClick={onNavigate}>
                <Icon name={i.icon} />
                {i.label}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

export function AdminShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="adm">
      <nav className="aside" aria-label="Administração">
        <Link href="/">
          <ShopLogo width={120} height={72} className="brand" />
        </Link>
        <NavLinks me={me} />
      </nav>
      <div className="amain">
        <StaffMeContext.Provider value={me}>
          <MobileMenuContext.Provider value={() => setMenu(true)}>{children}</MobileMenuContext.Provider>
        </StaffMeContext.Provider>
      </div>
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="aside !flex !h-full !w-[260px]">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <ShopLogo width={120} height={72} className="brand" />
          <NavLinks me={me} onNavigate={() => setMenu(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

const MobileMenuContext = createContext<() => void>(() => undefined);
const StaffMeContext = createContext<Me | null>(null);

/** Quem está logado no painel (o layout garante que existe). */
export function useStaffMe(): Me {
  const me = useContext(StaffMeContext);
  if (!me) throw new Error('useStaffMe fora do painel');
  return me;
}

function UserChip({ me }: { me: Me }) {
  const logout = useLogout();
  const role = me.roles.includes('ADMIN') ? 'Administrador' : me.roles.includes('RECEPTIONIST') ? 'Balconista' : 'Equipe';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rowx cursor-pointer gap-2 border-0 bg-transparent p-0 text-left text-[var(--ink)]" aria-label="Conta">
        <Avatar data={me.avatar} size={32} />
        <div className="hidden 2xl:block">
          <div className="xs b">{me.name}</div>
          <div className="xs muted">{role}</div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href="/">
            <Icon name="home" size="s" /> Ver o site
          </Link>
        </DropdownMenuItem>
        {me.roles.includes('BARBER') ? (
          <DropdownMenuItem asChild>
            <Link href="/barbeiro">
              <Icon name="scissor" size="s" /> Minha agenda
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <Icon name="logout" size="s" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Cabeçalho das páginas do painel (título, ações e usuário). `url` fica só como referência da rota. */
export function AdminHeader({ title, back, children, badge }: { url?: string; title: React.ReactNode; back?: string; children?: React.ReactNode; badge?: React.ReactNode }) {
  const openMenu = useContext(MobileMenuContext);
  const me = useStaffMe();
  return (
    <header className="ahead">
      <button type="button" className="ibtn !h-[34px] !w-[34px] min-[901px]:hidden" aria-label="Abrir menu" onClick={openMenu}>
        <Icon name="menu" size="s" />
      </button>
      {back ? (
        <Link className="ibtn !h-[34px] !w-[34px]" href={back} aria-label="Voltar">
          <Icon name="back" size="s" />
        </Link>
      ) : null}
      <div className="min-w-0">
        <h1 className="truncate">{title}</h1>
      </div>
      {badge}
      <span className="sp" />
      {children}
      <UserChip me={me} />
    </header>
  );
}

export function Pager({ page, pageSize, total, onPage, label }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; label?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const list = pages <= 7 ? Array.from({ length: pages }, (_, i) => i + 1) : [1, 2, 3, page > 3 && page < pages - 2 ? page : null, pages].filter((v, i, a): v is number => v !== null && a.indexOf(v) === i);
  return (
    <div className="pager">
      <span>Linhas por página</span>
      <b className="text-[var(--ink)]">{pageSize}</b>
      <span className="ml-3.5">
        {from}–{to} de {total}
        {label ? ` ${label}` : ''}
      </span>
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">
        ‹
      </button>
      {list.map((p) => (
        <button key={p} type="button" className={cn(p === page && 'on')} onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined}>
          {p}
        </button>
      ))}
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Próxima página">
        ›
      </button>
    </div>
  );
}

export function Kpi({ label, value, delta, tone = 'nt', highlight }: { label: string; value: React.ReactNode; delta?: React.ReactNode; tone?: 'up' | 'dn' | 'nt'; highlight?: boolean }) {
  return (
    <div className="kpi" style={highlight ? { borderColor: '#f2f2f2' } : undefined}>
      <div className="lab">{label}</div>
      <div className="val">{value}</div>
      {delta !== undefined ? <div className={cn('dl', tone === 'dn' && 'dn', tone === 'nt' && 'nt')}>{delta}</div> : null}
    </div>
  );
}

/** Filtro de período "De … até …" com datas nativas. */
export function DateRange({ from, to, onChange, prefix = 'De' }: { from: string; to: string; onChange: (v: { from: string; to: string }) => void; prefix?: string }) {
  return (
    <span className="fsel">
      {prefix}
      <DateInput bare value={from} max={to} onChange={(v) => onChange({ from: v, to })} aria-label="Data inicial" />
      até
      <DateInput bare value={to} min={from} onChange={(v) => onChange({ from, to: v })} aria-label="Data final" />
    </span>
  );
}

export function SelectFilter<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="fsel">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SearchBox({ value, onChange, placeholder, width = 160 }: { value: string; onChange: (v: string) => void; placeholder: string; width?: number }) {
  return (
    <label className="fsel">
      <Icon name="search" size="s" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} style={{ width, fontWeight: 500 }} />
    </label>
  );
}
