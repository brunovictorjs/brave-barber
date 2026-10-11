'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useDeferredValue, useEffect, useState } from 'react';
import { Note } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { ProductGridCard, ServiceGridCard } from '@/components/client/cards';
import { CartButton } from '@/components/client/cart';
import { Body, ClientTabBar, Screen } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/controls';
import { plural } from '@/lib/format';
import { useCategories, useProducts, useServices } from '@/lib/queries';
import { cn } from '@/lib/utils';

const PER_PAGE = 8;
const SORTS = { popular: 'Mais procurados', price: 'Menor preço', new: 'Novidades' } as const;

function CatalogScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = params.get('aba') === 'produtos' ? 'produtos' : 'servicos';
  const [cat, setCat] = useState(params.get('categoria') ?? 'all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<keyof typeof SORTS>(params.get('ordem') === 'novos' ? 'new' : 'popular');
  const [page, setPage] = useState(1);
  const query = useDeferredValue(q);

  const { data: serviceCats } = useCategories('SERVICE');
  const { data: productCats } = useCategories('PRODUCT');
  const services = useServices({ category: tab === 'servicos' && cat !== 'all' ? cat : undefined, q: query || undefined, sort });
  const products = useProducts({ category: tab === 'produtos' && cat !== 'all' ? cat : undefined, q: query || undefined });

  useEffect(() => setPage(1), [cat, query, sort, tab]);

  const switchTab = (next: 'servicos' | 'produtos') => {
    setCat('all');
    setQ('');
    router.replace(next === 'produtos' ? `${pathname}?aba=produtos` : pathname, { scroll: false });
  };

  const cats = (tab === 'servicos' ? serviceCats : productCats)?.filter((c) => c.count > 0) ?? [];
  const svcList = services.data ?? [];
  const pages = Math.max(1, Math.ceil(svcList.length / PER_PAGE));
  const shown = svcList.slice(0, page * PER_PAGE);

  return (
    <Screen>
      <Body>
        <div className="topnav">
          <h1 className="ttl">Catálogo</h1>
          <CartButton />
        </div>
        <nav className="segs mb-3.5" aria-label="O que você procura">
          <button type="button" className={cn(tab === 'servicos' && 'on')} aria-current={tab === 'servicos' ? 'page' : undefined} onClick={() => switchTab('servicos')}>
            Serviços
          </button>
          <button type="button" className={cn(tab === 'produtos' && 'on')} aria-current={tab === 'produtos' ? 'page' : undefined} onClick={() => switchTab('produtos')}>
            Produtos
          </button>
        </nav>
        <label className="input mb-3.5">
          <Icon name="search" size="s" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === 'servicos' ? 'Buscar corte, barba, cor…' : 'Buscar pomada, óleo, shampoo…'} aria-label={tab === 'servicos' ? 'Buscar serviço' : 'Buscar produto'} />
        </label>
        <div className="scrollx mb-3.5" role="group" aria-label="Categorias">
          <button type="button" className={cn('chip', cat === 'all' && 'on')} aria-pressed={cat === 'all'} onClick={() => setCat('all')}>
            Todos
            {tab === 'servicos' && serviceCats ? <b>{serviceCats.reduce((s, c) => s + c.count, 0)}</b> : null}
          </button>
          {cats.map((c) => (
            <button key={c.id} type="button" className={cn('chip', cat === c.slug && 'on')} aria-pressed={cat === c.slug} onClick={() => setCat(c.slug)}>
              {c.name}
            </button>
          ))}
        </div>

        {tab === 'servicos' ? (
          <>
            <div className="rowx xs muted mb-3">
              <span>{plural(svcList.length, 'serviço', 'serviços')}</span>
              <span className="sp" />
              <DropdownMenu>
                <DropdownMenuTrigger className="rowx xs cursor-pointer gap-[5px] border-0 bg-transparent p-0 text-[var(--ink-muted)]">
                  {SORTS[sort]} <Icon name="down" size="s" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((k) => (
                    <DropdownMenuItem key={k} onSelect={() => setSort(k)}>
                      {k === sort ? <Icon name="check" size="s" /> : <span className="w-4" />}
                      {SORTS[k]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Reveal className="g2" deps={[cat, query, sort, page, svcList.length]}>
              {services.isLoading
                ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[210px]" />)
                : shown.map((s) => <ServiceGridCard key={s.id} service={s} />)}
            </Reveal>
            {!services.isLoading && svcList.length === 0 ? <p className="xs muted center py-8">Nenhum serviço encontrado.</p> : null}
            {page < pages ? (
              <button type="button" className="btn ghost sm mx-auto mt-[18px] flex" onClick={() => setPage((p) => p + 1)}>
                Carregar mais
              </button>
            ) : null}
            {svcList.length ? <p className="xs muted center mt-3">{Math.min(page * PER_PAGE, svcList.length)} de {svcList.length} carregados</p> : null}
          </>
        ) : (
          <>
            <Note icon="bag" dashed className="mb-3.5">
              Você retira os produtos no balcão da barbearia. Se comprar junto com um serviço, a balconista entrega no dia do atendimento.
            </Note>
            <Reveal className="g2" deps={[cat, query, products.data?.length]}>
              {products.isLoading
                ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[230px]" />)
                : (products.data ?? []).map((p) => <ProductGridCard key={p.id} product={p} />)}
            </Reveal>
            <p className="xs muted center mt-4">{plural(products.data?.length ?? 0, 'produto', 'produtos')}</p>
          </>
        )}
      </Body>
      <ClientTabBar />
    </Screen>
  );
}

export default function CatalogPage() {
  return (
    <Suspense>
      <CatalogScreen />
    </Suspense>
  );
}
