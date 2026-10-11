import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppConfig } from '@/config/app-config.service';
import { DateKey, parseDateKey, toDateKey } from '@/shared/domain/business-time';
import { avatarFor, AvatarView, fullName } from '@/shared/domain/avatar';
import { DomainError } from '@/shared/domain/domain-error';
import { Money } from '@/shared/domain/money';
import { Clock } from '@/shared/infrastructure/clock';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import type { Offer } from '../domain/offer';
import { PricingService } from './pricing.service';

export interface OfferBadge {
  id: string;
  name: string;
  label: string; // "−25%" · "−R$ 10"
  endsOn: DateKey;
  daysLeft: number;
  weekdays: number[];
  appliesToday: boolean;
}

export interface ServiceCard {
  id: string;
  slug: string;
  name: string;
  summary: string;
  icon: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  durationMin: number;
  listPriceCents: number;
  priceCents: number;
  offer: OfferBadge | null;
  isNew: boolean;
  rating: { average: number | null; count: number };
  coverUrl: string | null;
  favorite: boolean;
  acceptsFavorites: boolean;
  sold: number;
  createdAt: string;
}

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  icon: string;
  categoryId: string;
  categoryName: string;
  detail: string;
  description: string;
  priceCents: number;
  highlight: string | null;
  available: boolean;
  sellOnline: boolean;
  barbersCanSell: boolean;
  coverUrl: string | null;
  mediaUrls: string[];
  favorite?: boolean;
  rating?: { average: number | null; count: number };
}

export interface BarberCard {
  id: string;
  name: string;
  firstName: string;
  headline: string;
  avatar: AvatarView;
  rating: { average: number | null; count: number };
}

const serviceSelect = {
  include: {
    category: true,
    media: { orderBy: { position: 'asc' } },
    barbers: { select: { barberId: true } },
    components: { select: { componentId: true } },
  },
} satisfies { include: Prisma.ServiceInclude };

type ServiceRow = Prisma.ServiceGetPayload<typeof serviceSelect>;

/** Consultas do catálogo (lado de leitura): vitrine, detalhe e tabelas do admin. */
@Injectable()
export class CatalogQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  private today(): DateKey {
    return toDateKey(this.clock.now(), this.config.timeZone);
  }

  offerBadge(offer: Offer, today: DateKey): OfferBadge {
    const o = offer.snapshot;
    const label = o.discountType === 'PERCENT' ? `−${Math.round(o.discountValue / 100)}%` : `−${Money.format(o.discountValue)}`;
    const end = parseDateKey(o.endsOn);
    const now = parseDateKey(today);
    const daysLeft = Math.max(0, Math.round((Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(now.year, now.month - 1, now.day)) / 86_400_000));
    return { id: offer.id, name: o.name, label, endsOn: o.endsOn, daysLeft, weekdays: o.weekdays, appliesToday: offer.appliesOn(today) };
  }

  private async serviceStats(ids: string[]) {
    const [ratings, sold] = await Promise.all([
      this.prisma.review.groupBy({ by: ['serviceId'], where: { serviceId: { in: ids } }, _avg: { serviceRating: true }, _count: true }),
      this.prisma.orderItem.groupBy({
        by: ['serviceId'],
        where: { serviceId: { in: ids }, order: { status: { in: ['SCHEDULED', 'IN_SERVICE', 'COMPLETED'] } } },
        _sum: { quantity: true },
      }),
    ]);
    return {
      rating: new Map(ratings.map((r) => [r.serviceId!, { average: r._avg.serviceRating, count: r._count }])),
      sold: new Map(sold.map((s) => [s.serviceId!, s._sum.quantity ?? 0])),
    };
  }

  private async toCards(rows: ServiceRow[], userId?: string): Promise<ServiceCard[]> {
    const today = this.today();
    const ids = rows.map((r) => r.id);
    const [offers, stats, favorites] = await Promise.all([
      this.pricing.offersByService(),
      this.serviceStats(ids),
      userId
        ? this.prisma.favorite.findMany({ where: { userId, serviceId: { in: ids } }, select: { serviceId: true } })
        : Promise.resolve([]),
    ]);
    const favSet = new Set(favorites.map((f) => f.serviceId));
    return rows.map((row) => {
      const offer = offers.get(row.id);
      const active = offer?.isActiveOn(today) ? offer : undefined;
      const rating = stats.rating.get(row.id);
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        summary: row.summary,
        icon: row.icon,
        categoryId: row.categoryId,
        categoryName: row.category.name,
        categorySlug: row.category.slug,
        durationMin: row.durationMin,
        listPriceCents: row.priceCents,
        priceCents: active ? active.priceFor(row.priceCents) : row.priceCents,
        offer: active ? this.offerBadge(active, today) : null,
        isNew: row.isNew,
        rating: { average: rating?.average ? Math.round(rating.average * 10) / 10 : null, count: rating?.count ?? 0 },
        coverUrl: row.media.find((m) => m.kind === 'IMAGE')?.url ?? null,
        favorite: favSet.has(row.id),
        acceptsFavorites: row.acceptsFavorites,
        sold: stats.sold.get(row.id) ?? 0,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async publicServices(userId?: string, opts: { category?: string; q?: string; sort?: 'popular' | 'price' | 'new' } = {}): Promise<ServiceCard[]> {
    const rows = await this.prisma.service.findMany({
      where: {
        status: 'ACTIVE',
        category: opts.category ? { slug: opts.category } : undefined,
        name: opts.q ? this.prisma.contains(opts.q) : undefined,
      },
      ...serviceSelect,
      orderBy: { name: 'asc' },
    });
    const cards = await this.toCards(rows, userId);
    if (opts.sort === 'price') return cards.sort((a, b) => a.priceCents - b.priceCents);
    if (opts.sort === 'new') return cards.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.createdAt.localeCompare(a.createdAt));
    return cards.sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name));
  }

  async serviceDetail(slug: string, userId?: string) {
    const row = await this.prisma.service.findUnique({ where: { slug }, ...serviceSelect });
    if (!row || row.status === 'ARCHIVED') throw DomainError.notFound('Serviço');
    const [card] = await this.toCards([row], userId);
    const [barbers, reviews, components] = await Promise.all([
      this.barbersByIds(row.barbers.map((b) => b.barberId)),
      this.serviceReviews(row.id, 1),
      this.prisma.service.findMany({ where: { id: { in: row.components.map((c) => c.componentId) } }, select: { id: true, name: true } }),
    ]);
    return {
      ...card!,
      status: row.status,
      description: row.description,
      media: row.media.map((m) => ({ url: m.url, kind: m.kind })),
      barbers,
      components,
      reviews,
    };
  }

  /** Avaliações de um serviço, mais recentes primeiro, em páginas. */
  async serviceReviews(serviceId: string, page: number, pageSize = 5) {
    const where = { serviceId };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({ where, include: { customer: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.review.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({ id: r.id, name: fullName(r.customer), avatar: avatarFor(r.customer), rating: r.serviceRating, text: r.text ?? '', createdAt: r.createdAt.toISOString() })),
      total,
      page,
      pageSize,
    };
  }

  async serviceReviewsBySlug(slug: string, page: number) {
    const row = await this.prisma.service.findUnique({ where: { slug }, select: { id: true } });
    if (!row) throw DomainError.notFound('Serviço');
    return this.serviceReviews(row.id, page);
  }

  /** Avaliações de um produto, em páginas. */
  async productReviews(productId: string, page: number, pageSize = 5) {
    const where = { productId };
    const [rows, total] = await Promise.all([
      this.prisma.productReview.findMany({ where, include: { customer: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.productReview.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({ id: r.id, name: fullName(r.customer), avatar: avatarFor(r.customer), rating: r.rating, text: r.text ?? '', createdAt: r.createdAt.toISOString() })),
      total,
      page,
      pageSize,
    };
  }

  async productReviewsBySlug(slug: string, page: number) {
    const row = await this.prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (!row) throw DomainError.notFound('Produto');
    return this.productReviews(row.id, page);
  }

  /** Página do produto: fotos, preço, detalhes, nota e avaliações. */
  async productDetail(slug: string, userId?: string) {
    const row = await this.prisma.product.findUnique({ where: { slug }, include: { category: true, media: { orderBy: { position: 'asc' } } } });
    if (!row || !row.sellOnline) throw DomainError.notFound('Produto');
    const [card] = await this.withProductStats([this.productCard(row)], userId);
    const [reviews, related] = await Promise.all([
      this.productReviews(row.id, 1),
      this.prisma.product.findMany({
        where: { categoryId: row.categoryId, sellOnline: true, available: true, id: { not: row.id } },
        include: { category: true, media: { orderBy: { position: 'asc' } } },
        take: 4,
      }),
    ]);
    return { ...card!, reviews, related: await this.withProductStats(related.map((p) => this.productCard(p)), userId) };
  }

  /** Acrescenta nota média e favorito do usuário aos cards de produto. */
  async withProductStats(cards: ProductCard[], userId?: string): Promise<ProductCard[]> {
    const ids = cards.map((c) => c.id);
    const [ratings, favorites] = await Promise.all([
      this.prisma.productReview.groupBy({ by: ['productId'], where: { productId: { in: ids } }, _avg: { rating: true }, _count: true }),
      userId ? this.prisma.favorite.findMany({ where: { userId, productId: { in: ids } }, select: { productId: true } }) : Promise.resolve([]),
    ]);
    const fav = new Set(favorites.map((f) => f.productId));
    return cards.map((c) => {
      const r = ratings.find((x) => x.productId === c.id);
      return { ...c, favorite: fav.has(c.id), rating: { average: r?._avg.rating ? Math.round(r._avg.rating * 10) / 10 : null, count: r?._count ?? 0 } };
    });
  }

  async barbersByIds(ids?: string[]): Promise<BarberCard[]> {
    const users = await this.prisma.user.findMany({
      where: { active: true, roles: { contains: 'BARBER' }, id: ids ? { in: ids } : undefined },
      include: { staffProfile: true },
      orderBy: { firstName: 'asc' },
    });
    const ratings = await this.prisma.review.groupBy({
      by: ['barberId'],
      where: { barberId: { in: users.map((u) => u.id) } },
      _avg: { barberRating: true },
      _count: true,
    });
    const byId = new Map(ratings.map((r) => [r.barberId!, r]));
    return users.map((u) => {
      const r = byId.get(u.id);
      return {
        id: u.id,
        name: fullName(u),
        firstName: u.firstName,
        headline: u.staffProfile?.headline ?? '',
        avatar: avatarFor(u),
        rating: { average: r?._avg.barberRating ? Math.round(r._avg.barberRating * 10) / 10 : null, count: r?._count ?? 0 },
      };
    });
  }

  async publicProducts(opts: { category?: string; q?: string } = {}, userId?: string): Promise<ProductCard[]> {
    const rows = await this.prisma.product.findMany({
      where: {
        sellOnline: true,
        category: opts.category ? { slug: opts.category } : undefined,
        name: opts.q ? this.prisma.contains(opts.q) : undefined,
      },
      include: { category: true, media: { orderBy: { position: 'asc' } } },
      orderBy: [{ available: 'desc' }, { name: 'asc' }],
    });
    return this.withProductStats(rows.map((r) => this.productCard(r)), userId);
  }

  productCard(r: Prisma.ProductGetPayload<{ include: { category: true; media: true } }>): ProductCard {
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      icon: r.icon,
      categoryId: r.categoryId,
      categoryName: r.category.name,
      detail: r.detail,
      description: r.description,
      priceCents: r.priceCents,
      highlight: r.available ? r.highlight : 'Indisponível',
      available: r.available,
      sellOnline: r.sellOnline,
      barbersCanSell: r.barbersCanSell,
      coverUrl: r.media[0]?.url ?? null,
      mediaUrls: r.media.map((m) => m.url),
    };
  }

  /** Itens que um barbeiro pode lançar no atendimento ou no pedido avulso. */
  async staffSellable() {
    const [services, products] = await Promise.all([
      this.prisma.service.findMany({ where: { status: 'ACTIVE' }, ...serviceSelect, orderBy: { name: 'asc' } }),
      this.prisma.product.findMany({
        where: { available: true, barbersCanSell: true },
        include: { category: true, media: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    const cards = await this.toCards(services);
    return {
      services: cards.map((c, i) => ({ ...c, barberIds: services[i]!.barbers.map((b) => b.barberId) })),
      products: products.map((p) => this.productCard(p)),
    };
  }

  async categories(kind?: 'SERVICE' | 'PRODUCT') {
    const rows = await this.prisma.category.findMany({
      where: kind ? { kind } : undefined,
      include: { _count: { select: { services: true, products: true } } },
      orderBy: [{ kind: 'asc' }, { position: 'asc' }],
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      kind: c.kind,
      icon: c.icon,
      position: c.position,
      count: c.kind === 'SERVICE' ? c._count.services : c._count.products,
    }));
  }

  // ── Administração ─────────────────────────────────────────────────────────

  async adminServices(opts: { q?: string; category?: string; status?: string; inOffer?: 'yes' | 'no' } = {}) {
    const rows = await this.prisma.service.findMany({
      where: {
        name: opts.q ? this.prisma.contains(opts.q) : undefined,
        categoryId: opts.category || undefined,
        status: opts.status || undefined,
      },
      ...serviceSelect,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    const cards = await this.toCards(rows);
    const offers = await this.pricing.offersByService();
    const today = this.today();
    return cards
      .map((card, i) => {
        const row = rows[i]!;
        const photos = row.media.filter((m) => m.kind === 'IMAGE').length;
        const videos = row.media.length - photos;
        const offer = offers.get(row.id);
        const open = offer?.isOpenOn(today) ? this.offerBadge(offer, today) : null;
        return {
          ...card,
          status: row.status,
          offer: open,
          barberIds: row.barbers.map((b) => b.barberId),
          componentIds: row.components.map((c) => c.componentId),
          mediaSummary: [
            photos ? `${photos} ${photos === 1 ? 'foto' : 'fotos'}` : null,
            videos ? `${videos} ${videos === 1 ? 'vídeo' : 'vídeos'}` : null,
            row.isNew ? 'novo' : null,
            open ? `em oferta até ${open.endsOn.slice(8, 10)}/${open.endsOn.slice(5, 7)}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        };
      })
      .filter((s) => (opts.inOffer === 'yes' ? !!s.offer : opts.inOffer === 'no' ? !s.offer : true));
  }

  async adminService(id: string) {
    const row = await this.prisma.service.findUnique({ where: { id }, ...serviceSelect });
    if (!row) throw DomainError.notFound('Serviço');
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      categoryId: row.categoryId,
      priceCents: row.priceCents,
      durationMin: row.durationMin,
      summary: row.summary,
      description: row.description,
      icon: row.icon,
      status: row.status,
      isNew: row.isNew,
      acceptsFavorites: row.acceptsFavorites,
      barberIds: row.barbers.map((b) => b.barberId),
      componentIds: row.components.map((c) => c.componentId),
      media: row.media.map((m) => ({ url: m.url, kind: m.kind })),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async adminProducts(opts: { q?: string; category?: string; available?: 'yes' | 'no'; from?: DateKey; to?: DateKey } = {}) {
    const rows = await this.prisma.product.findMany({
      where: {
        name: opts.q ? this.prisma.contains(opts.q) : undefined,
        categoryId: opts.category || undefined,
        available: opts.available ? opts.available === 'yes' : undefined,
      },
      include: { category: true, media: { orderBy: { position: 'asc' } } },
      orderBy: [{ available: 'desc' }, { name: 'asc' }],
    });
    const sales = await this.prisma.orderItem.groupBy({
      by: ['productId', 'addedByRole'],
      where: {
        productId: { in: rows.map((r) => r.id) },
        order: { status: { in: ['SCHEDULED', 'IN_SERVICE', 'COMPLETED'] } },
      },
      _sum: { quantity: true },
    });
    const sold = (id: string, site: boolean) =>
      sales
        .filter((s) => s.productId === id && (site ? s.addedByRole === 'CLIENT' : s.addedByRole !== 'CLIENT'))
        .reduce((sum, s) => sum + (s._sum.quantity ?? 0), 0);
    return rows.map((r) => ({
      ...this.productCard(r),
      highlight: r.highlight,
      soldOnline: sold(r.id, true),
      soldByStaff: sold(r.id, false),
    }));
  }

  async adminProduct(id: string) {
    const row = await this.prisma.product.findUnique({ where: { id }, include: { category: true, media: { orderBy: { position: 'asc' } } } });
    if (!row) throw DomainError.notFound('Produto');
    return { ...this.productCard(row), highlight: row.highlight, updatedAt: row.updatedAt.toISOString() };
  }

  async adminOffers() {
    const today = this.today();
    const rows = await this.prisma.offer.findMany({
      include: { services: { include: { service: { select: { id: true, name: true, priceCents: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    const tz = this.config.timeZone;
    return rows.map((r) => {
      const startsOn = toDateKey(r.startsOn, tz);
      const endsOn = toDateKey(r.endsOn, tz);
      const status = r.endedAt || endsOn < today ? 'ENDED' : startsOn > today ? 'SCHEDULED' : 'ACTIVE';
      return {
        id: r.id,
        name: r.name,
        discountType: r.discountType,
        discountValue: r.discountValue,
        label: r.discountType === 'PERCENT' ? `−${Math.round(r.discountValue / 100)}%` : `−${Money.format(r.discountValue)}`,
        startsOn,
        endsOn,
        weekdays: JSON.parse(r.weekdays) as number[],
        usageLimit: r.usageLimit,
        usedCount: r.usedCount,
        status,
        services: r.services.map((s) => s.service),
      };
    });
  }

  /** Para o cadastro de oferta: serviços livres e os que já estão em outra oferta. */
  async offerAvailability(exceptOfferId?: string) {
    const today = this.today();
    const offers = await this.prisma.offer.findMany({
      where: { endedAt: null, id: exceptOfferId ? { not: exceptOfferId } : undefined },
      include: { services: true },
    });
    const tz = this.config.timeZone;
    const taken = new Map<string, string>();
    for (const o of offers) {
      if (toDateKey(o.endsOn, tz) < today) continue;
      for (const s of o.services) taken.set(s.serviceId, o.name);
    }
    const services = await this.prisma.service.findMany({ where: { status: 'ACTIVE' }, include: { category: true }, orderBy: { name: 'asc' } });
    return {
      free: services
        .filter((s) => !taken.has(s.id))
        .map((s) => ({ id: s.id, name: s.name, categoryName: s.category.name, categoryId: s.categoryId, priceCents: s.priceCents })),
      taken: services.filter((s) => taken.has(s.id)).map((s) => ({ id: s.id, name: s.name, offerName: taken.get(s.id)! })),
      total: services.length,
    };
  }

  async adminOffer(id: string) {
    const offers = await this.adminOffers();
    const offer = offers.find((o) => o.id === id);
    if (!offer) throw DomainError.notFound('Oferta');
    return offer;
  }

  /** Novidades: serviços marcados como novos (para a landing). */
  async news(userId?: string) {
    const cards = await this.publicServices(userId);
    const fresh = cards.filter((c) => c.isNew);
    const since = fresh.reduce<string | null>((min, c) => (!min || c.createdAt < min ? c.createdAt : min), null);
    return { items: fresh, since: since ? toDateKey(new Date(since), this.config.timeZone) : null };
  }
}
