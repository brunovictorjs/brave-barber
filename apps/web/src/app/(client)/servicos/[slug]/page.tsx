'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { Avatar, Photo, RatingBadge } from '@/components/brand/brand';
import { Icon } from '@/components/brand/icon';
import { useLoginRedirect } from '@/components/client/auth-guard';
import { useAddToCart } from '@/components/client/cart';
import { ServiceMarkdown } from '@/components/client/markdown';
import { ReviewList } from '@/components/client/review-list';
import { BackButton, Body, Foot, Screen } from '@/components/client/shell';
import { Reveal } from '@/components/motion/motion';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { duration, money, weekdayName } from '@/lib/format';
import { useService, useToggleFavorite } from '@/lib/queries';
import { useMe } from '@/lib/session';

export default function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data: service, isLoading, error } = useService(slug);
  const { data: me } = useMe();
  const login = useLoginRedirect();
  const toggle = useToggleFavorite();
  const { add, pending } = useAddToCart();
  const [media, setMedia] = useState(0);

  if (error) {
    return (
      <Screen size="wide">
        <Body>
          <div className="topnav">
            <BackButton href="/catalogo" />
          </div>
          <p className="m muted">Este serviço não está mais disponível.</p>
        </Body>
      </Screen>
    );
  }

  const current = service?.media[media];
  const offerDays = service?.offer ? service.offer.weekdays.map((d) => weekdayName(d)).join(' e ') : '';

  return (
    <Screen size="wide">
      <Body flush className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:p-8">
        <section className="relative h-[272px] md:h-[380px] lg:sticky lg:top-8 lg:h-[520px] lg:overflow-hidden lg:rounded-[8px] lg:border lg:border-[var(--line)]">
          {current?.kind === 'VIDEO' ? (
            <video src={current.url} className="absolute inset-0 h-full w-full object-cover" controls playsInline />
          ) : (
            <Photo url={current?.url ?? service?.coverUrl} icon={service?.icon ?? 'scissor'} className="absolute inset-0 !rounded-none [&>svg]:!h-24 [&>svg]:!w-24" />
          )}
          <div className="absolute left-4 right-4 top-3.5 z-[3] flex">
            <div className="[&_.ibtn]:!bg-[rgba(10,10,10,.75)]">
              <BackButton href="/catalogo" />
            </div>
            <span className="sp" />
            {service?.acceptsFavorites ? (
              <button
                type="button"
                className="ibtn !bg-[rgba(10,10,10,.75)]"
                aria-pressed={service.favorite}
                aria-label="Favoritar"
                onClick={() => (me ? toggle.mutate({ kind: 'services', id: service.id, on: !service.favorite }) : login())}
              >
                <Icon name={service.favorite ? 'heartf' : 'heart'} />
              </button>
            ) : null}
          </div>
          {service && service.media.length > 1 ? (
            <div className="absolute bottom-3.5 left-4 z-[3] flex items-center gap-[7px]">
              {service.media.slice(0, 5).map((m, i) => (
                <button
                  key={m.url}
                  type="button"
                  onClick={() => setMedia(i)}
                  aria-label={m.kind === 'VIDEO' ? 'Vídeo' : `Foto ${i + 1}`}
                  aria-pressed={media === i}
                  className="grid h-[34px] w-[46px] cursor-pointer place-items-center overflow-hidden rounded-[4px] bg-[#1e1e1e] p-0 text-[#f2f2f2]"
                  style={{ border: media === i ? '2px solid #f2f2f2' : '1px solid #3a3a3a' }}
                >
                  {m.kind === 'VIDEO' ? <Icon name="video" size="s" /> : <img src={m.url} alt="" className="h-full w-full object-cover" />}
                </button>
              ))}
              {service.media.length > 5 ? <span className="xs ml-[3px] text-[#d4d4d4]">+{service.media.length - 5}</span> : null}
            </div>
          ) : null}
        </section>

        <div className="p-[18px] md:px-7 lg:p-0">
          {isLoading || !service ? (
            <div className="stack">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-24" />
            </div>
          ) : (
            <Reveal>
              <div className="rowx mb-2.5 gap-2">
                <span className="chip sm">{service.categoryName}</span>
                {service.isNew ? <span className="badge info">Novo</span> : null}
                {service.offer ? <span className="badge warn">{service.offer.label}</span> : null}
              </div>
              <h1 className="disp m-0 text-[26px]">{service.name}</h1>
              <div className="rowx mb-4 mt-3 gap-3.5">
                <span className="rowx m muted gap-[5px]">
                  <Icon name="clock" size="s" />
                  {duration(service.durationMin)} estimadas
                </span>
                <RatingBadge average={service.rating.average} count={service.rating.count} compact className="!text-[14px]" />
              </div>
              {service.offer ? (
                <div className="card raised mb-3 flex items-center gap-2.5 !px-3.5 !py-3">
                  <Icon name="tag" />
                  <p className="xs">
                    <b>{service.offer.name}</b>
                    <span className="muted">
                      {' '}
                      · vale para atendimentos de {offerDays} até {service.offer.endsOn.slice(8, 10)}/{service.offer.endsOn.slice(5, 7)}
                    </span>
                  </p>
                </div>
              ) : null}
              {service.components.length ? (
                <p className="xs muted mb-3">
                  Inclui {service.components.map((c) => c.name).join(' + ')}. Montando o pacote no carrinho, o desconto do combo entra sozinho.
                </p>
              ) : null}
              <ServiceMarkdown source={service.description || service.summary} />

              {service.barbers.length ? (
                <>
                  <h2 className="sec">Quem faz</h2>
                  <div className="scrollx gap-2.5">
                    {service.barbers.map((b) => (
                      <Link key={b.id} href={`/profissionais/${b.id}`} className="card center w-[118px] !px-2 !py-3">
                        <Avatar data={b.avatar} size={44} className="mx-auto mb-2" />
                        <div className="xs b">{b.name}</div>
                        <RatingBadge average={b.rating.average} className="mt-1" />
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}

              <div className="sec-row">
                <h2 className="sec">Avaliações do serviço</h2>
                {service.rating.count ? <span className="more no-underline">{service.rating.count}</span> : null}
              </div>
              <ReviewList url={`/catalog/services/${service.slug}/reviews`} initial={service.reviews} empty="Ainda sem avaliações." />
            </Reveal>
          )}
        </div>
      </Body>
      <Foot className="side flex items-center gap-3.5" clean={false}>
        <div>
          <div className="xs muted">Total</div>
          <div className="rowx gap-2">
            <span className="price text-[22px]">{service ? money(service.priceCents) : '—'}</span>
            {service && service.priceCents < service.listPriceCents ? <span className="xs strike">{money(service.listPriceCents)}</span> : null}
          </div>
        </div>
        <Button className="flex-1" disabled={!service} loading={pending} onClick={() => service && add({ serviceId: service.id })}>
          Escolher horário
        </Button>
      </Foot>
    </Screen>
  );
}
