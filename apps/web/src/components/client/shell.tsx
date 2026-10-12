'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/brand/icon';
import { ShopLogo } from '@/components/brand/shop-brand';
import { cn } from '@/lib/utils';

/**
 * Tela do cliente/barbeiro. No celular é sempre a coluna de até 480px; em tablet
 * e desktop a largura segue o tipo de tela: `narrow` (fluxos e formulários),
 * `medium` (listas e perfis) ou `wide` (vitrine e detalhes).
 */
export function Screen({ children, className, size = 'narrow' }: { children: React.ReactNode; className?: string; size?: 'narrow' | 'medium' | 'wide' }) {
  return <main className={cn('scr', size, className)}>{children}</main>;
}

export function Body({ children, className, flush }: { children: React.ReactNode; className?: string; flush?: boolean }) {
  return <div className={cn('body', flush && 'flush', className)}>{children}</div>;
}

export function Foot({ children, className, clean = true }: { children: React.ReactNode; className?: string; clean?: boolean }) {
  return <div className={cn('foot', clean && 'clean', className)}>{children}</div>;
}

/** Voltar: usa o link indicado ou o histórico do navegador. */
export function BackButton({ href, label = 'Voltar' }: { href?: string; label?: string }) {
  const router = useRouter();
  if (href) {
    return (
      <Link className="ibtn" href={href} aria-label={label}>
        <Icon name="back" />
      </Link>
    );
  }
  return (
    <button type="button" className="ibtn" aria-label={label} onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}>
      <Icon name="back" />
    </button>
  );
}

export function TopNav({ title, back, right, step }: { title: React.ReactNode; back?: string | true; right?: React.ReactNode; step?: string }) {
  return (
    <div className="topnav">
      {back ? <BackButton href={back === true ? undefined : back} /> : null}
      <h1 className="ttl">{title}</h1>
      {step ? <span className="chip sm">{step}</span> : null}
      {right}
    </div>
  );
}

const CLIENT_TABS = [
  { href: '/', label: 'Início', icon: 'home', match: (p: string) => p === '/' },
  { href: '/catalogo', label: 'Serviços', icon: 'scissor', match: (p: string) => p.startsWith('/catalogo') || p.startsWith('/servicos') || p.startsWith('/produtos') },
  { href: '/pedidos', label: 'Agenda', icon: 'cal', match: (p: string) => p.startsWith('/pedidos') },
  { href: '/perfil', label: 'Perfil', icon: 'user', match: (p: string) => p.startsWith('/perfil') || p.startsWith('/favoritos') },
];

export function ClientTabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Navegação principal">
      <Link href="/" className="tabbrand" aria-label="Início">
        <ShopLogo width={72} height={48} />
      </Link>
      {CLIENT_TABS.map((t) => {
        const on = t.match(pathname);
        return (
          <Link key={t.href} href={t.href} className={cn('tab', on && 'on')} aria-current={on ? 'page' : undefined}>
            <Icon name={t.icon} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

const BARBER_TABS = [
  { href: '/barbeiro', label: 'Agenda', icon: 'cal', match: (p: string) => p === '/barbeiro' || p.startsWith('/barbeiro/avulso') || p.startsWith('/barbeiro/atendimento') },
  { href: '/barbeiro/conferir', label: 'Fila', icon: 'clock', match: (p: string) => p.startsWith('/barbeiro/conferir') },
  { href: '/barbeiro/ganhos', label: 'Ganhos', icon: 'money', match: (p: string) => p.startsWith('/barbeiro/ganhos') },
  { href: '/barbeiro/perfil', label: 'Perfil', icon: 'user', match: (p: string) => p.startsWith('/barbeiro/perfil') },
];

export function BarberTabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Navegação do barbeiro">
      <Link href="/barbeiro" className="tabbrand" aria-label="Agenda">
        <ShopLogo width={72} height={48} />
      </Link>
      {BARBER_TABS.map((t) => {
        const on = t.match(pathname);
        return (
          <Link key={t.href} href={t.href} className={cn('tab', on && 'on')} aria-current={on ? 'page' : undefined}>
            <Icon name={t.icon} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
