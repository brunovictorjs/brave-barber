'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import type { Category } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Abas Serviços | Produtos do catálogo no painel. */
export function CatalogTabs() {
  const pathname = usePathname();
  const { data } = useQuery({ queryKey: ['admin-categories'], queryFn: () => api.get<Category[]>('/admin/categories') });
  const services = data?.filter((c) => c.kind === 'SERVICE').reduce((s, c) => s + c.count, 0);
  const products = data?.filter((c) => c.kind === 'PRODUCT').reduce((s, c) => s + c.count, 0);
  const onProducts = pathname.startsWith('/admin/produtos');
  return (
    <nav className="tabs" aria-label="Catálogo">
      <Link href="/admin/servicos" className={cn(!onProducts && 'on')} aria-current={!onProducts ? 'page' : undefined}>
        Serviços <span className="muted font-normal">{services ?? ''}</span>
      </Link>
      <Link href="/admin/produtos" className={cn(onProducts && 'on')} aria-current={onProducts ? 'page' : undefined}>
        Produtos <span className="muted font-normal">{products ?? ''}</span>
      </Link>
    </nav>
  );
}
