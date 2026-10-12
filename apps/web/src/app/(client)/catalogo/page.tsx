'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useDeferredValue, useEffect, useRef, useState } from 'react';
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

/** Itens por página do catálogo (divide certinho nas grades de 2, 3 e 4 colunas). */
const PER_PAGE = 12;
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
  const products = useProducts({ category: tab === 'produtos' && cat !== 'all' ? cat : undefined, q: query || undefined, sort });

  useEffect(() => setPage(1), [cat, query, sort, tab]);

  const switchTab = (next: 'servicos' | 'produtos') => {
    setCat('all');
    setQ('');
    router.replace(next === 'produtos' ? `${pathname}?aba=produtos` : pathname, { scroll: false });
  };

  const cats = (tab === 'servicos' ? serviceCats : productCats)?.filter((c) => c.count > 0) ?? [];
  const svcList = services.data ?? [];
  const prdList = products.data ?? [];
  const total = tab === 'servicos' ? svcList.length : prdList.length;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const from = (page - 1) * PER_PAGE;
  const svcShown = svcList.slice(from, from + PER_PAGE);
  const prdShown = prdList.slice(from, from + PER_PAGE);
  const top = useRef<HTMLDivElement>(null);
  const go = (p: number) => {
    setPage(p);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Paginação: ‹ 1 2 3 › e "13–24 de 30".
  const pager = total > PER_PAGE ? (
    <>
      <nav className="pager mt-[18px] justify-center" aria-label="Páginas do catálogo">
        <button type="button" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Página anterior">
          ‹
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
          <button key={p} type="button" className={cn(p === page && 'on')} onClick={() => go(p)} aria-current={p === page ? 'page' : undefined}>
            {p}
          </button>
        ))}
        <button type="button" disabled={page >= pages} onClick={() => go(page + 1)} aria-label="Próxima página">
          ›
        </button>
      </nav>
      <p className="xs muted center mt-2">
        {from + 1}–{Math.min(from + PER_PAGE, total)} de {total}
      </p>
    </>
  ) : null;

  // Contagem + ordenação (Mais procurados, Menor preço, Novidades), igual nas duas abas.
  const sortRow = (count: string) => (
    <div className="rowx xs muted mb-3">
      <span>{count}</span>
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
  );

  return (
    <Screen size="wide">
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
            <div ref={top} className="scroll-mt-20" />
            {sortRow(plural(svcList.length, 'serviço', 'serviços'))}
            <Reveal className="gcards" deps={[cat, query, sort, page, svcList.length]}>
              {services.isLoading
                ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[210px]" />)
                : svcShown.map((s) => <ServiceGridCard key={s.id} service={s} />)}
            </Reveal>
            {!services.isLoading && svcList.length === 0 ? <p className="xs muted center py-8">Nenhum serviço encontrado.</p> : null}
            {pager}
          </>
        ) : (
          <>
            <Note icon="bag" dashed className="mb-3.5">
              Você retira os produtos no balcão da barbearia. Se comprar junto com um serviço, a balconista entrega no dia do atendimento.
            </Note>
            <div ref={top} className="scroll-mt-20" />
            {sortRow(plural(prdList.length, 'produto', 'produtos'))}
            <Reveal className="gcards" deps={[cat, query, sort, page, prdList.length]}>
              {products.isLoading
                ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[230px]" />)
                : prdShown.map((p) => <ProductGridCard key={p.id} product={p} />)}
            </Reveal>
            {!products.isLoading && !prdList.length ? <p className="xs muted center py-8">Nenhum produto encontrado.</p> : null}
            {pager}
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
