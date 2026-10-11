import { Injectable } from '@nestjs/common';
import { AppConfig } from '@/config/app-config.service';
import { avatarFor, fullName } from '@/shared/domain/avatar';
import { minutesOfDay, parseHm, toDateKey, weekdayOf } from '@/shared/domain/business-time';
import { DomainError } from '@/shared/domain/domain-error';
import { Clock } from '@/shared/infrastructure/clock';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { ClosuresService } from '@/modules/business/application/closures.service';
import { SettingsService } from '@/modules/business/application/settings.service';
import { CatalogQueries } from '@/modules/catalog/application/catalog.queries';
import { FavoritesService } from '@/modules/engagement/application/favorites.service';
import { ReviewsService } from '@/modules/reviews/application/reviews.service';
import { AvailabilityService } from '@/modules/scheduling/application/availability.service';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/**
 * Vitrine pública (lado de leitura que junta vários módulos): a landing e o
 * perfil público de cada profissional.
 */
@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogQueries,
    private readonly reviews: ReviewsService,
    private readonly availability: AvailabilityService,
    private readonly favorites: FavoritesService,
    private readonly settings: SettingsService,
    private readonly closures: ClosuresService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  /** "Barbearia aberta até 20H" / "Abre terça às 9H". */
  private async openStatus() {
    const tz = this.config.timeZone;
    const now = this.clock.now();
    const today = toDateKey(now, tz);
    const [hours, closed] = await Promise.all([this.settings.get('hours'), this.closures.closedDays(today, today)]);
    const h = hours.weekly.find((w) => w.weekday === weekdayOf(today));
    const nowMin = minutesOfDay(now, tz);
    const hourLabel = (hm: string) => {
      const [hh, mm] = hm.split(':');
      return mm === '00' ? `${Number(hh)}H` : `${Number(hh)}H${mm}`;
    };
    if (!closed.has(today) && h?.open && h.close && nowMin >= parseHm(h.open) && nowMin < parseHm(h.close)) {
      const onBreak = h.breakStart && h.breakEnd && nowMin >= parseHm(h.breakStart) && nowMin < parseHm(h.breakEnd);
      return { open: !onBreak, label: onBreak ? `Intervalo até ${hourLabel(h.breakEnd!)}` : `Barbearia aberta até ${hourLabel(h.close)}` };
    }
    for (let i = 0; i < 8; i++) {
      const wd = (weekdayOf(today) + i) % 7;
      const next = hours.weekly.find((w) => w.weekday === wd);
      if (!next?.open) continue;
      if (i === 0 && nowMin >= parseHm(next.open)) continue;
      return { open: false, label: `Abre ${i === 0 ? 'hoje' : i === 1 ? 'amanhã' : WEEKDAYS[wd]!.toLowerCase()} às ${hourLabel(next.open)}` };
    }
    return { open: false, label: 'Fechada' };
  }

  private hoursSummary(weekly: { weekday: number; open: string | null; close: string | null }[]) {
    const openDays = weekly.filter((w) => w.open);
    if (!openDays.length) return { main: 'Fechada', note: '' };
    const first = openDays[0]!;
    const last = openDays[openDays.length - 1]!;
    const fmt = (hm: string) => hm.replace(':00', 'h').replace(':', 'h');
    const closedNames = weekly.filter((w) => !w.open).map((w) => WEEKDAYS[w.weekday]!.toLowerCase());
    return {
      main: `${WEEKDAYS[first.weekday]} a ${WEEKDAYS[last.weekday]!.toLowerCase()}, ${fmt(first.open!)} às ${fmt(first.close!)}`,
      note: closedNames.length ? `${closedNames.join(' e ').replace(/^./, (c) => c.toUpperCase())} fechado` : 'Todos os dias',
    };
  }

  async home(userId?: string) {
    const [shop, hours, status, nextFree, services, barbers, reviews, ratingAgg, categories] = await Promise.all([
      this.settings.get('shop'),
      this.settings.get('hours'),
      this.openStatus(),
      this.availability.nextFreeSlot(),
      this.catalog.publicServices(userId),
      this.catalog.barbersByIds(),
      this.reviews.homeCarousel(),
      this.prisma.review.aggregate({ _avg: { serviceRating: true }, _count: true }),
      this.catalog.categories('SERVICE'),
    ]);
    const profiles = await this.prisma.user.findMany({ where: { id: { in: barbers.map((b) => b.id) } }, select: { id: true, about: true, specialties: true } });
    const team = barbers.filter((b) => {
      const p = profiles.find((x) => x.id === b.id);
      return !!p?.about && (JSON.parse(p.specialties) as string[]).length > 0;
    });
    const quick = categories
      .filter((c) => services.some((s) => s.categoryId === c.id))
      .slice(0, 3)
      .map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        fromCents: Math.min(...services.filter((s) => s.categoryId === c.id).map((s) => s.priceCents)),
      }));
    const news = services.filter((s) => s.isNew);
    return {
      shop,
      status,
      hours: this.hoursSummary(hours.weekly),
      nextFree,
      rating: { average: ratingAgg._avg.serviceRating ? Math.round(ratingAgg._avg.serviceRating * 10) / 10 : null, count: ratingAgg._count },
      chairs: Math.max(...hours.weekly.map((w) => w.chairs)),
      barbersCount: barbers.length,
      quick,
      news: { items: news, since: news.length ? news.map((n) => n.createdAt).sort()[0] : null },
      offers: services.filter((s) => s.offer),
      catalog: services.slice(0, 6),
      categories: categories.filter((c) => c.count > 0),
      team,
      reviews,
    };
  }

  async barber(id: string, userId?: string) {
    const user = await this.prisma.user.findFirst({ where: { id, roles: { contains: 'BARBER' }, active: true }, include: { staffProfile: true, serviceSkills: { include: { service: true } } } });
    if (!user) throw DomainError.notFound('Profissional');
    const [rating, completed, reviews, favorite] = await Promise.all([
      this.prisma.review.aggregate({ where: { barberId: id }, _avg: { barberRating: true }, _count: true }),
      this.prisma.order.count({ where: { barberId: id, status: 'COMPLETED' } }),
      this.reviews.publicForBarber(id, 1),
      this.favorites.isFavoriteBarber(userId, id),
    ]);
    return {
      id: user.id,
      name: fullName(user),
      firstName: user.firstName,
      avatar: avatarFor(user),
      headline: user.staffProfile?.headline ?? '',
      sinceYear: user.staffProfile?.sinceYear ?? null,
      about: user.about,
      specialties: JSON.parse(user.specialties) as string[],
      rating: { average: rating._avg.barberRating ? Math.round(rating._avg.barberRating * 10) / 10 : null, count: rating._count },
      completed,
      services: user.serviceSkills.filter((s) => s.service.status === 'ACTIVE').map((s) => ({ id: s.service.id, slug: s.service.slug, name: s.service.name })),
      reviews,
      favorite,
    };
  }
}
