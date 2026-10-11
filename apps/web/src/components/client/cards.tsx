'use client';

import Link from 'next/link';
import { Photo, RatingBadge } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { duration, money } from '@/lib/format';
import { useCart, useToggleFavorite } from '@/lib/queries';
import { useMe } from '@/lib/session';
import type { ProductCard, ServiceCard } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useLoginRedirect } from './auth-guard';
import { useAddToCart } from './cart';

function useFavorite(service: ServiceCard) {
  const { data: me } = useMe();
  const login = useLoginRedirect();
  const toggle = useToggleFavorite();
  return () => {
    if (!me) return login();
    toggle.mutate({ kind: 'services', id: service.id, on: !service.favorite });
  };
}

function Tag({ service }: { service: ServiceCard }) {
  if (service.offer) return <span className="badge warn tl">{service.offer.label}</span>;
  if (service.isNew) return <span className="badge info tl">Novo</span>;
  return null;
}

/** Card da grade do catálogo (2 colunas). */
export function ServiceGridCard({ service }: { service: ServiceCard }) {
  const fav = useFavorite(service);
  return (
    <div className="card flat relative" data-reveal>
      <Link href={`/servicos/${service.slug}`} className="block">
        <Photo url={service.coverUrl} icon={service.icon} className="h-28 !rounded-none">
          <Tag service={service} />
        </Photo>
        <div className="p-2.5">
          <div className="s b">{service.name}</div>
          <div className="xs muted mb-[7px] mt-[3px]">
            {duration(service.durationMin)} · {service.categoryName}
          </div>
          <div className="rowx gap-1.5">
            <span className="price">{money(service.priceCents)}</span>
            {service.priceCents < service.listPriceCents ? <span className="xs strike">{money(service.listPriceCents)}</span> : null}
            <span className="sp" />
            <RatingBadge average={service.rating.average} />
          </div>
        </div>
      </Link>
      {service.acceptsFavorites ? <FavOverlay on={service.favorite} name={service.name} onClick={fav} /> : null}
    </div>
  );
}

/** Card horizontal (landing e favoritos). */
export function ServiceRowCard({ service, action }: { service: ServiceCard; action?: React.ReactNode }) {
  const fav = useFavorite(service);
  return (
    <div className="card flat flex" data-reveal>
      <Link href={`/servicos/${service.slug}`} className="contents">
        <Photo url={service.coverUrl} icon={service.icon} className="w-24 flex-[0_0_96px] !rounded-none">
          {service.offer ? <span className="badge warn tl">{service.offer.label}</span> : null}
        </Photo>
      </Link>
      <div className="min-w-0 flex-1 p-3">
        <div className="rowx">
          <Link href={`/servicos/${service.slug}`} className="s b">
            {service.name}
          </Link>
          <span className="sp" />
          {service.acceptsFavorites ? (
            <button type="button" onClick={fav} aria-pressed={service.favorite} aria-label={service.favorite ? 'Remover dos favoritos' : 'Favoritar'} className="cursor-pointer border-0 bg-transparent p-0 text-[var(--ink)]">
              <Icon name={service.favorite ? 'heartf' : 'heart'} />
            </button>
          ) : null}
        </div>
        <div className="rowx xs muted mb-[7px] mt-[5px] gap-2.5">
          <span className="rowx gap-1">
            <Icon name="clock" size="s" />
            {duration(service.durationMin)}
          </span>
          <RatingBadge average={service.rating.average} count={service.rating.count} compact className="!text-[var(--ink)]" />
        </div>
        <div className="rowx gap-[7px]">
          <span className="price">{money(service.priceCents)}</span>
          {service.priceCents < service.listPriceCents ? <span className="xs strike">{money(service.listPriceCents)}</span> : null}
          {action ? (
            <>
              <span className="sp" />
              {action}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function useProductFavorite(product: ProductCard) {
  const { data: me } = useMe();
  const login = useLoginRedirect();
  const toggle = useToggleFavorite();
  return () => {
    if (!me) return login();
    toggle.mutate({ kind: 'products', id: product.id, on: !product.favorite });
  };
}

/** Coração sobre a foto (cards de serviço e produto). */
function FavOverlay({ on, name, onClick }: { on: boolean; name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="ibtn absolute right-2 top-2 z-[2] !h-8 !w-8 !bg-[rgba(10,10,10,.75)]"
      aria-pressed={on}
      aria-label={`${on ? 'Remover dos favoritos' : 'Favoritar'} ${name}`}
      onClick={onClick}
    >
      <Icon name={on ? 'heartf' : 'heart'} size="s" />
    </button>
  );
}

/** Produto à venda (retirada no balcão). */
export function ProductGridCard({ product }: { product: ProductCard }) {
  const { add, pending } = useAddToCart();
  const { data: me } = useMe();
  const { data: cart } = useCart(!!me);
  const fav = useProductFavorite(product);
  const inCart = cart?.items.some((i) => i.refId === product.id) ?? false;
  const off = !product.available;
  return (
    <div className={cn('card flat relative', off && 'opacity-55')} data-reveal>
      <Link href={`/produtos/${product.slug}`} className="block">
        <Photo url={product.coverUrl} icon={product.icon} className="h-[104px] !rounded-none">
          {product.highlight ? <span className="badge n tl">{product.highlight}</span> : null}
        </Photo>
        <div className="px-2.5 pt-2.5">
          <div className="s b">{product.name}</div>
          <div className="xs muted mb-2 mt-[3px]">{product.detail}</div>
          <div className="rowx mb-2.5 gap-1.5">
            <span className="price">{money(product.priceCents)}</span>
            <span className="sp" />
            {product.rating?.average != null ? <RatingBadge average={product.rating.average} /> : null}
          </div>
        </div>
      </Link>
      <FavOverlay on={!!product.favorite} name={product.name} onClick={fav} />
      <div className="px-2.5 pb-2.5">
        <button
          type="button"
          className={cn('btn sm w-full', off ? 'off' : inCart ? 'primary' : 'dark')}
          aria-disabled={off}
          aria-pressed={inCart}
          disabled={off || pending}
          onClick={() => add({ productId: product.id }, { openSheet: false })}
        >
          {off ? 'Indisponível' : inCart ? 'No carrinho · +1' : 'Adicionar'}
        </button>
      </div>
    </div>
  );
}

/** Card horizontal de produto (favoritos). */
export function ProductRowCard({ product }: { product: ProductCard }) {
  const fav = useProductFavorite(product);
  const { add, pending } = useAddToCart();
  const off = !product.available;
  return (
    <div className={cn('card flat flex', off && 'opacity-55')} data-reveal>
      <Link href={`/produtos/${product.slug}`} className="contents">
        <Photo url={product.coverUrl} icon={product.icon} className="w-24 flex-[0_0_96px] !rounded-none" />
      </Link>
      <div className="min-w-0 flex-1 p-3">
        <div className="rowx">
          <Link href={`/produtos/${product.slug}`} className="s b">
            {product.name}
          </Link>
          <span className="sp" />
          <button type="button" onClick={fav} aria-pressed={!!product.favorite} aria-label={product.favorite ? 'Remover dos favoritos' : 'Favoritar'} className="cursor-pointer border-0 bg-transparent p-0 text-[var(--ink)]">
            <Icon name={product.favorite ? 'heartf' : 'heart'} />
          </button>
        </div>
        <div className="xs muted mb-[7px] mt-[5px]">{product.detail || product.categoryName}</div>
        <div className="rowx gap-[7px]">
          <span className="price">{money(product.priceCents)}</span>
          <span className="sp" />
          <button type="button" className={cn('btn sm', off ? 'off' : 'dark')} disabled={off || pending} onClick={() => add({ productId: product.id }, { openSheet: false })}>
            {off ? 'Indisponível' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}
