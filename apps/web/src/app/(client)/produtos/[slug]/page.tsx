'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { Photo, RatingBadge } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { useProductFavorite } from '@/components/client/cards';
import { useAddToCart } from '@/components/client/cart';
import { ServiceMarkdown } from '@/components/client/markdown';
import { ReviewList } from '@/components/client/review-list';
import { BackButton, Body, Foot, Screen } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { money } from '@/lib/format';
import { useCart, useProduct } from '@/lib/queries';
import { useMe } from '@/lib/session';
import type { ProductCard } from '@/lib/types';

/** Página do produto: fotos, preço, detalhes e avaliações (retirada no balcão). */
export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: product, isLoading, error } = useProduct(slug);
  const [media, setMedia] = useState(0);

  if (error) {
    return (
      <Screen>
        <Body>
          <div className="topnav">
            <BackButton href="/catalogo?aba=produtos" />
          </div>
          <p className="m muted">Este produto não está mais disponível.</p>
        </Body>
      </Screen>
    );
  }

  const photos = product?.mediaUrls ?? [];

  return (
    <Screen>
      <Body flush>
        <section className="relative h-[272px]">
          <Photo url={photos[media] ?? product?.coverUrl} icon={product?.icon ?? 'bag'} className="absolute inset-0 !rounded-none [&>svg]:!h-24 [&>svg]:!w-24" />
          <div className="absolute left-4 right-4 top-3.5 z-[3] flex">
            <div className="[&_.ibtn]:!bg-[rgba(10,10,10,.75)]">
              <BackButton href="/catalogo?aba=produtos" />
            </div>
            <span className="sp" />
            {product ? <FavButton product={product} /> : null}
          </div>
          {photos.length > 1 ? (
            <div className="absolute bottom-3.5 left-4 z-[3] flex items-center gap-[7px]">
              {photos.slice(0, 5).map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setMedia(i)}
                  aria-label={`Foto ${i + 1}`}
                  aria-pressed={media === i}
                  className="grid h-[34px] w-[46px] cursor-pointer place-items-center overflow-hidden rounded-[4px] bg-[#1e1e1e] p-0"
                  style={{ border: media === i ? '2px solid #f2f2f2' : '1px solid #3a3a3a' }}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
              {photos.length > 5 ? <span className="xs ml-[3px] text-[#d4d4d4]">+{photos.length - 5}</span> : null}
            </div>
          ) : null}
        </section>

        <div className="p-[18px]">
          {isLoading || !product ? (
            <div className="stack">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-24" />
            </div>
          ) : (
            <Reveal>
              <div className="rowx mb-2.5 gap-2">
                <span className="chip sm">{product.categoryName}</span>
                {product.highlight ? <span className="badge n">{product.highlight}</span> : null}
                {!product.available ? <span className="badge n">Indisponível</span> : null}
              </div>
              <h1 className="disp m-0 text-[26px]">{product.name}</h1>
              <div className="rowx mb-4 mt-3 gap-3.5">
                {product.detail ? <span className="m muted">{product.detail}</span> : null}
                <RatingBadge average={product.rating?.average ?? null} count={product.rating?.count} compact className="!text-[14px]" />
              </div>
              <div className="card raised mb-4 flex items-center gap-2.5 !px-3.5 !py-3">
                <Icon name="bag" />
                <p className="xs muted">
                  <b className="text-[var(--ink)]">Retirada no balcão.</b> Compre junto com um horário ou sozinho; mostre o código do pedido na recepção.
                </p>
              </div>
              {product.description ? <ServiceMarkdown source={product.description} /> : null}

              <div className="sec-row">
                <h2 className="sec">Avaliações do produto</h2>
                {product.rating?.count ? <span className="more no-underline">{product.rating.count}</span> : null}
              </div>
              <ReviewList url={`/catalog/products/${product.slug}/reviews`} initial={product.reviews} empty="Ainda sem avaliações. Quem compra pode avaliar depois de retirar." />

              {product.related.length ? (
                <>
                  <h2 className="sec">Da mesma categoria</h2>
                  <div className="scrollx gap-2.5">
                    {product.related.map((p) => (
                      <RelatedCard key={p.id} product={p} />
                    ))}
                  </div>
                </>
              ) : null}
            </Reveal>
          )}
        </div>
      </Body>
      {product ? <BuyBar product={product} /> : null}
    </Screen>
  );
}

function FavButton({ product }: { product: ProductCard }) {
  const fav = useProductFavorite(product);
  return (
    <button type="button" className="ibtn !bg-[rgba(10,10,10,.75)]" aria-pressed={!!product.favorite} aria-label={product.favorite ? 'Remover dos favoritos' : 'Favoritar'} onClick={fav}>
      <Icon name={product.favorite ? 'heartf' : 'heart'} />
    </button>
  );
}

function BuyBar({ product }: { product: ProductCard }) {
  const { add, pending } = useAddToCart();
  const { data: me } = useMe();
  const { data: cart } = useCart(!!me);
  const qty = cart?.items.find((i) => i.refId === product.id)?.quantity ?? 0;
  return (
    <Foot className="flex items-center gap-3.5" clean={false}>
      <div>
        <div className="xs muted">Preço</div>
        <span className="price text-[22px]">{money(product.priceCents)}</span>
      </div>
      <Button className="flex-1" disabled={!product.available} loading={pending} onClick={() => add({ productId: product.id }, { openSheet: false })}>
        {!product.available ? 'Indisponível' : qty ? `No carrinho (${qty}) · +1` : 'Adicionar ao carrinho'}
      </Button>
    </Foot>
  );
}

function RelatedCard({ product }: { product: ProductCard }) {
  return (
    <Link href={`/produtos/${product.slug}`} className="card flat w-[150px] flex-[0_0_150px]">
      <Photo url={product.coverUrl} icon={product.icon} className="h-[84px] !rounded-none" />
      <div className="p-2.5">
        <div className="xs b">{product.name}</div>
        <div className="price mt-1 text-[14px]">{money(product.priceCents)}</div>
      </div>
    </Link>
  );
}
