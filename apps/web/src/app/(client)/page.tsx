'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Avatar, Photo, RatingBadge, Stars } from '@/components/brand/brand';
import { coverUrl, ShopLogo, ShopMap, parseCoordinates } from '@/components/brand/shop-brand';
import { Icon } from '@/components/brand/icon';
import { ServiceRowCard } from '@/components/client/cards';
import { CartButton } from '@/components/client/cart';
import { Body, ClientTabBar, Screen } from '@/components/client/shell';
import { ChromeText, Reveal } from '@/components/motion/motion';
import { Skeleton } from '@/components/ui/controls';
import { cap, daysFromToday, longDate, money } from '@/lib/format';
import { useNotifications, useStorefront } from '@/lib/queries';
import { useMe } from '@/lib/session';
import type { StorefrontHome } from '@/lib/types';
import { cn } from '@/lib/utils';

const WORDS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];
function numberWord(n: number, gender: 'm' | 'f'): string {
  if (n === 1) return gender === 'f' ? 'uma' : 'um';
  if (n === 2) return gender === 'f' ? 'duas' : 'dois';
  return WORDS[n] ?? String(n);
}

function nextFreeLabel(next: StorefrontHome['nextFree']) {
  if (!next) return 'Sem vagas em breve';
  const d = daysFromToday(next.date);
  return `${d === 0 ? 'Hoje' : d === 1 ? 'Amanhã' : cap(longDate(next.date).split(',')[0]!)}, ${next.time}`;
}

/** Landing: topo, novidades, ofertas, catálogo, avaliações, equipe e a casa. */
export default function HomePage() {
  const { data: home } = useStorefront();
  const { data: me } = useMe();
  const { data: notes } = useNotifications(!!me && me.roles.some((r) => r !== 'CLIENT'));
  const [cat, setCat] = useState('all');
  const hero = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        tl.from('[data-hero="photo"]', { scale: 1.08, autoAlpha: 0, duration: 1.2 })
          .from('[data-hero="line"]', { y: 28, autoAlpha: 0, duration: 0.7, stagger: 0.1 }, '-=0.8')
          .from('[data-hero="cta"]', { y: 16, autoAlpha: 0, duration: 0.5 }, '-=0.3');
      });
      return () => mm.revert();
    },
    { scope: hero },
  );

  const catalog = home ? (cat === 'all' ? home.catalog : home.catalog.filter((s) => s.categorySlug === cat)) : [];

  return (
    <Screen size="wide">
      <Body flush>
        <div ref={hero}>
          <section className="relative h-[480px] md:h-[520px] lg:h-[560px]">
            <div data-hero="photo" className="absolute inset-0 overflow-hidden bg-[#0e0e0e]">
              {home ? <img src={coverUrl(home.shop)} alt="" className="h-full w-full object-cover" fetchPriority="high" /> : null}
            </div>
            <div className="absolute inset-0" style={{ background: 'linear-gradient(rgba(10,10,10,.2), rgba(10,10,10,.1) 30%, rgba(10,10,10,.85) 70%, #0a0a0a)' }} />
            <div className="absolute inset-0 z-[3] flex flex-col px-[18px] py-3.5 md:px-7 md:py-5 lg:px-10 lg:pb-10">
              <div className="rowx">
                <ShopLogo width={78} height={52} className="-ml-2 lg:invisible" />
                <span className="sp" />
                {me && me.roles.some((r) => r !== 'CLIENT') ? (
                  <Link className="ibtn" href={me.roles.includes('BARBER') ? '/barbeiro/avisos' : '/admin'} aria-label="Avisos">
                    <Icon name="bell" />
                    {notes?.unread ? <span className="dot-n">{notes.unread}</span> : null}
                  </Link>
                ) : null}
                <CartButton />
              </div>
              <div className="mt-auto">
                {home ? (
                  <span data-hero="line" className={cn('badge dot', home.status.open ? 'info' : 'n')}>
                    {home.status.label}
                  </span>
                ) : (
                  <Skeleton className="h-[22px] w-48" />
                )}
                <h1 data-hero="line" className="disp mt-3.5 text-[34px] leading-[.98] md:text-[48px] lg:text-[60px]">
                  Sua melhor
                  <br />
                  versão,
                </h1>
                <div data-hero="line">
                  <ChromeText className="disp block text-[44px] leading-none md:text-[62px] lg:text-[78px]">hora marcada</ChromeText>
                </div>
                <p data-hero="line" className="m muted mt-3 max-w-[30ch]">
                  {home
                    ? `${cap(numberWord(home.chairs, 'f'))} cadeiras, ${numberWord(home.barbersCount, 'm')} barbeiros${home.nextFree ? ` e o próximo horário livre ${nextFreeLabel(home.nextFree).toLowerCase()}` : ''}.`
                    : 'Corte, barba e coloração com hora marcada.'}
                </p>
              </div>
            </div>
          </section>
          <div className="px-[18px] pb-2 pt-[18px] md:px-7 lg:px-10">
            <Link data-hero="cta" className="btn primary mb-2.5 md:max-w-[320px]" href="/catalogo">
              Agendar agora <Icon name="chev" size="s" />
            </Link>
            <div className="g2">
              <div className="card !px-3 !py-[11px]">
                <div className="xs muted">Próximo livre</div>
                <div className="b lg num mt-[3px]">{home ? nextFreeLabel(home.nextFree) : '—'}</div>
              </div>
              <div className="card !px-3 !py-[11px]">
                <div className="xs muted">Avaliação</div>
                <div className="rowx mt-[3px] gap-1.5">
                  <span className="b lg">{home?.rating.average?.toFixed(1).replace('.', ',') ?? '—'}</span>
                  <Stars value={1} size={14} className="[&>svg:not(:first-child)]:hidden" />
                  <span className="xs muted">{home?.rating.count ?? ''}</span>
                </div>
              </div>
            </div>
            <h2 className="sec">Escolha rápida</h2>
            <div className="g3">
              {(home?.quick ?? []).map((q) => (
                <Link key={q.id} className="card center min-w-0 overflow-hidden !px-1.5 !py-3.5" href={`/catalogo?categoria=${q.slug}`}>
                  <Icon name={q.icon} size="l" className="mx-auto" />
                  <div className="s b mt-2 truncate">{q.name}</div>
                  <div className="xs muted leading-tight">a partir de</div>
                  <div className="xs b num">{money(q.fromCents)}</div>
                </Link>
              ))}
              {!home ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[92px]" />) : null}
            </div>
          </div>
        </div>

        <Reveal className="px-[18px] pb-6 md:px-7 lg:px-10 lg:pb-12" deps={[!!home]}>
          {home && home.news.items.length ? (
            <div data-reveal>
              <div className="sec-row">
                <h2 className="sec">Novidades</h2>
                <Link className="more" href="/catalogo?ordem=novos">
                  ver tudo
                </Link>
              </div>
              <section className="card raised flat" style={{ borderColor: '#9a9a9a' }}>
                <div className="rowx gap-[9px] px-3.5 pb-2.5 pt-3.5">
                  <span className="badge info">Novo na casa</span>
                  <span className="xs muted">{home.news.items.length} serviços novos este mês</span>
                </div>
                <div className="scrollx gap-2.5 px-3.5 pb-3.5">
                  {home.news.items.map((s) => (
                    <Link key={s.id} href={`/servicos/${s.slug}`} className="w-[118px]">
                      <Photo url={s.coverUrl} icon={s.icon} className="h-[92px]" />
                      <div className="s b mt-[7px]">{s.name}</div>
                      <div className="xs muted">{money(s.priceCents)}</div>
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {home && home.offers.length ? (
            <div data-reveal>
              <div className="sec-row">
                <h2 className="sec">Em oferta</h2>
                <Link className="more" href="/catalogo">
                  ver tudo
                </Link>
              </div>
              <div className="glist">
                {home.offers.map((s) => (
                  <Link key={s.id} className="card flat flex" href={`/servicos/${s.slug}`}>
                    <Photo url={s.coverUrl} icon={s.icon} className="w-28 flex-[0_0_112px] !rounded-none">
                      <span className="badge warn tl">{s.offer!.label}</span>
                    </Photo>
                    <div className="flex-1 p-[13px]">
                      <div className="s b">{s.name}</div>
                      <div className="xs muted mb-2 mt-[3px]">{s.offer!.name}</div>
                      <div className="rowx gap-2">
                        <span className="price text-[17px]">{money(s.priceCents)}</span>
                        <span className="xs strike">{money(s.listPriceCents)}</span>
                      </div>
                      <div className="xs rowx mt-1.5 gap-1.5">
                        <Icon name="clock" size="s" />
                        {s.offer!.daysLeft === 0 ? 'termina hoje' : `termina em ${s.offer!.daysLeft} ${s.offer!.daysLeft === 1 ? 'dia' : 'dias'}`}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <div data-reveal>
            <div className="sec-row">
              <h2 className="sec">Catálogo</h2>
              <Link className="more" href="/catalogo">
                ver tudo
              </Link>
            </div>
            <div className="scrollx mb-3" role="group" aria-label="Categorias">
              <button type="button" className={cn('chip', cat === 'all' && 'on')} onClick={() => setCat('all')}>
                Todos
              </button>
              {(home?.categories ?? []).map((c) => (
                <button key={c.id} type="button" className={cn('chip', cat === c.slug && 'on')} onClick={() => setCat(c.slug)}>
                  {c.name}
                </button>
              ))}
            </div>
            <div className="glist">
              {catalog.slice(0, 4).map((s) => (
                <ServiceRowCard key={s.id} service={s} />
              ))}
              {home && catalog.length === 0 ? <p className="xs muted center py-4">Nenhum serviço nessa categoria por enquanto.</p> : null}
            </div>
          </div>

          {home ? <Testimonials home={home} /> : null}

          {home && home.team.length ? (
            <div data-reveal>
              <h2 className="sec">Quem vai te atender</h2>
              <div className="gteam">
                {home.team.map((b) => (
                  <Link key={b.id} className="card center" href={`/profissionais/${b.id}`}>
                    <Avatar data={b.avatar} size={56} className="mx-auto mb-2.5" />
                    <div className="s b">{b.name}</div>
                    <div className="xs muted mb-1.5 mt-0.5">{b.headline}</div>
                    <RatingBadge average={b.rating.average} count={b.rating.count} />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {home ? (
            <div data-reveal>
              <h2 className="sec">A casa</h2>
              <section className="card">
                {parseCoordinates(home.shop.coordinates) ? (
                  <ShopMap coordinates={home.shop.coordinates} title={home.shop.tradeName} className="mb-1.5 h-[180px]" />
                ) : (
                  <div className="photo mb-1.5 h-[120px]">
                    <ShopLogo width={150} height={100} className="opacity-80" />
                  </div>
                )}
                <div className="list">
                  <div className="li">
                    <Icon name="pin" />
                    <div>
                      <div className="s b">
                        {home.shop.address} – {home.shop.district}
                      </div>
                      <div className="xs muted">{home.shop.cityUf.replace(' / ', ' – ')}</div>
                    </div>
                  </div>
                  <div className="li">
                    <Icon name="clock" />
                    <div>
                      <div className="s b">{home.hours.main}</div>
                      <div className="xs muted">{home.hours.note}</div>
                    </div>
                  </div>
                  <div className="li">
                    <Icon name="insta" />
                    <div>
                      <div className="s b">{home.shop.instagram}</div>
                      <div className="xs muted">
                        {home.shop.publicEmail} · {home.shop.phone}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
              <div className="center mb-1.5 mt-[26px]">
                <div className="bb-tagline justify-center text-[11px]">Estilo • Respeito • Confiança</div>
                <div className="script mt-2.5 text-[30px]">Sua melhor versão, sempre.</div>
              </div>
              <div className="rowx xs muted mb-2 mt-3.5 justify-center gap-3.5">
                <Link className="lnk" href="/termos">
                  Termos de serviço
                </Link>
                <span>·</span>
                <Link className="lnk" href="/privacidade">
                  Política de privacidade
                </Link>
              </div>
            </div>
          ) : null}
        </Reveal>
      </Body>
      <ClientTabBar />
    </Screen>
  );
}

/** "O que dizem": carrossel das avaliações completas com nota máxima. */
function Testimonials({ home }: { home: StorefrontHome }) {
  const [i, setI] = useState(0);
  const card = useRef<HTMLElement>(null);
  const list = home.reviews;
  const go = (next: number) => {
    const n = list.length;
    if (!n) return;
    const target = (next + n) % n;
    const el = card.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setI(target);
    gsap.to(el, {
      autoAlpha: 0,
      x: next > i ? -24 : 24,
      duration: 0.2,
      onComplete: () => {
        setI(target);
        gsap.fromTo(el, { autoAlpha: 0, x: next > i ? 24 : -24 }, { autoAlpha: 1, x: 0, duration: 0.3, ease: 'power2.out' });
      },
    });
  };
  if (!list.length) return null;
  const r = list[i]!;
  return (
    <div data-reveal>
      <div className="sec-row">
        <h2 className="sec">O que dizem</h2>
        <div className="rowx gap-1.5">
          <button type="button" className="ibtn !h-9 !w-9" onClick={() => go(i - 1)} aria-label="Avaliação anterior">
            <Icon name="back" size="s" />
          </button>
          <button type="button" className="ibtn !h-9 !w-9" onClick={() => go(i + 1)} aria-label="Próxima avaliação">
            <Icon name="chev" size="s" />
          </button>
        </div>
      </div>
      <article ref={card} className="card raised min-h-[196px]" aria-live="polite">
        <div className="rowx mb-[11px]">
          <Avatar data={r.customer.avatar} size={38} />
          <div>
            <div className="s b">{r.customer.name}</div>
            <div className="xs muted">
              {r.serviceLabel}
              {r.barber ? ` · com ${r.barber.firstName}` : ''}
            </div>
          </div>
          <span className="sp" />
          <Stars value={5} />
        </div>
        <p className="m">{r.text}</p>
        <div className="xs muted mt-2.5">{r.dateLabel}</div>
      </article>
      <div className="rowx mt-3 justify-center gap-1.5">
        {list.map((_, k) => (
          <i key={k} className="block h-[3px] rounded-[3px] transition-all" style={{ width: k === i ? 18 : 6, background: k === i ? '#f2f2f2' : '#3a3a3a' }} />
        ))}
      </div>
      <p className="xs muted center mt-2">Só entram no carrossel avaliações com nota, texto e serviço preenchidos.</p>
    </div>
  );
}
