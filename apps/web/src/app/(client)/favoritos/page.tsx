'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Avatar, Empty, RatingBadge } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { RequireAuth } from '@/components/client/auth-guard';
import { ProductRowCard, ServiceRowCard } from '@/components/client/cards';
import { useAddToCart } from '@/components/client/cart';
import { Body, ClientTabBar, Screen, TopNav } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { api } from '@/lib/api';
import { plural } from '@/lib/format';
import { useToggleFavorite } from '@/lib/queries';
import type { BarberCard, ProductCard, ServiceCard } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function FavoritesPage() {
  const [tab, setTab] = useState<'s' | 'r' | 'p'>('s');
  const { data } = useQuery({ queryKey: ['favorites'], queryFn: () => api.get<{ services: ServiceCard[]; products: ProductCard[]; barbers: BarberCard[] }>('/me/favorites') });
  const toggle = useToggleFavorite();
  const { add } = useAddToCart();
  const services = data?.services ?? [];
  const barbers = data?.barbers ?? [];
  const products = data?.products ?? [];
  const step = tab === 's' ? plural(services.length, 'serviço', 'serviços') : tab === 'r' ? plural(products.length, 'produto', 'produtos') : plural(barbers.length, 'profissional', 'profissionais');

  return (
    <Screen size="medium">
      <RequireAuth>
        {() => (
          <Body>
            <TopNav title="Favoritos" back="/perfil" step={step} />
            <div className="segs mb-4" role="tablist">
              <button role="tab" type="button" className={cn(tab === 's' && 'on')} aria-selected={tab === 's'} onClick={() => setTab('s')}>
                Serviços
              </button>
              <button role="tab" type="button" className={cn(tab === 'r' && 'on')} aria-selected={tab === 'r'} onClick={() => setTab('r')}>
                Produtos
              </button>
              <button role="tab" type="button" className={cn(tab === 'p' && 'on')} aria-selected={tab === 'p'} onClick={() => setTab('p')}>
                Profissionais
              </button>
            </div>
            {tab === 's' ? (
              <Reveal className="glist" deps={[services.length]}>
                {services.map((s) => (
                  <ServiceRowCard
                    key={s.id}
                    service={s}
                    action={
                      <button type="button" className="btn sm dark" onClick={() => add({ serviceId: s.id })}>
                        Agendar
                      </button>
                    }
                  />
                ))}
                {data && !services.length ? (
                  <Empty icon="heart" title="Nenhum serviço favorito">
                    Toque no coração de um serviço do catálogo para guardar aqui.
                  </Empty>
                ) : null}
              </Reveal>
            ) : tab === 'r' ? (
              <Reveal className="glist" deps={[products.length]}>
                {products.map((p) => (
                  <ProductRowCard key={p.id} product={p} />
                ))}
                {data && !products.length ? (
                  <Empty icon="bag" title="Nenhum produto favorito">
                    Toque no coração de um produto do catálogo para guardar aqui.
                  </Empty>
                ) : null}
              </Reveal>
            ) : (
              <Reveal className="glist" deps={[barbers.length]}>
                {barbers.map((b) => (
                  <div className="card flex items-center gap-3" key={b.id}>
                    <Avatar data={b.avatar} size={48} />
                    <div className="flex-1">
                      <div className="s b">{b.name}</div>
                      <div className="xs muted mb-1 mt-0.5">{b.headline}</div>
                      <RatingBadge average={b.rating.average} count={b.rating.count} />
                    </div>
                    <button type="button" className="ibtn !h-9 !w-9" aria-label="Remover dos favoritos" onClick={() => toggle.mutate({ kind: 'barbers', id: b.id, on: false })}>
                      <Icon name="heartf" size="s" />
                    </button>
                    <Link className="btn sm dark" href={`/profissionais/${b.id}`}>
                      Agendar
                    </Link>
                  </div>
                ))}
                {data && !barbers.length ? (
                  <Empty icon="users" title="Nenhum profissional favorito">
                    Abra o perfil de quem te atende e toque no coração.
                  </Empty>
                ) : null}
              </Reveal>
            )}
          </Body>
        )}
      </RequireAuth>
      <ClientTabBar />
    </Screen>
  );
}
