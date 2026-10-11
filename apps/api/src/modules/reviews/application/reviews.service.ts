import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppConfig } from '@/config/app-config.service';
import { avatarFor, fullName } from '@/shared/domain/avatar';
import { addDays, toDateKey, zonedParts } from '@/shared/domain/business-time';
import { DomainError, invariant } from '@/shared/domain/domain-error';
import { makePeriod } from '@/shared/domain/period';
import { newId } from '@/shared/domain/text';
import type { Actor } from '@/shared/presentation/auth';
import { Clock } from '@/shared/infrastructure/clock';
import { EventBus } from '@/shared/infrastructure/event-bus';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { Review, ReviewCreated } from '../domain/review';

export const reviewInput = z.object({
  serviceRating: z.number().int().min(1).max(5).optional(),
  barberRating: z.number().int().min(1).max(5).optional(),
  text: z.string().max(1000).nullable().default(null),
  products: z
    .array(z.object({ productId: z.string(), rating: z.number().int().min(1).max(5), text: z.string().max(600).nullable().default(null) }))
    .default([]),
});

export const adminReviewsQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  rating: z.enum(['5', '4', 'below4']).optional(),
  onHome: z.enum(['yes', 'no']).optional(),
  barberId: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const include = { customer: true, barber: true, order: { select: { code: true, items: true } } } satisfies Prisma.ReviewInclude;
type Row = Prisma.ReviewGetPayload<{ include: typeof include }>;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBus,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  private toReview(r: Row): Review {
    return Review.restore(r.id, {
      orderId: r.orderId,
      customerId: r.customerId,
      barberId: r.barberId,
      serviceId: r.serviceId,
      serviceLabel: r.serviceLabel,
      serviceRating: r.serviceRating,
      barberRating: r.barberRating,
      text: r.text,
      showOnHome: r.showOnHome,
      reply: r.reply,
      repliedById: r.repliedById,
      repliedAt: r.repliedAt,
      createdAt: r.createdAt,
    });
  }

  private view(r: Row) {
    const review = this.toReview(r);
    const p = zonedParts(r.createdAt, this.config.timeZone);
    return {
      id: r.id,
      orderCode: r.order.code,
      customer: { id: r.customerId, name: fullName(r.customer), avatar: avatarFor(r.customer) },
      barber: r.barber ? { id: r.barber.id, name: fullName(r.barber), firstName: r.barber.firstName } : null,
      serviceLabel: r.serviceLabel,
      serviceRating: r.serviceRating,
      barberRating: r.barberRating,
      text: r.text,
      showOnHome: r.showOnHome,
      eligibleForHome: review.eligibleForHome,
      reply: r.reply,
      repliedAt: r.repliedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      dateLabel: `${p.day} de ${MONTHS[p.month - 1]}`,
    };
  }

  /** O que a tela "Como foi?" precisa saber sobre o pedido. */
  async prepare(actor: Actor, code: string) {
    const order = await this.prisma.order.findUnique({
      where: { code: code.toUpperCase() },
      include: { items: true, barber: { include: { staffProfile: true } }, review: true, productReviews: { select: { productId: true } } },
    });
    if (!order || order.customerId !== actor.id) throw DomainError.notFound('Pedido');
    const services = order.items.filter((i) => i.kind === 'SERVICE');
    const reviewed = new Set(order.productReviews.map((p) => p.productId));
    const products = [...new Map(order.items.filter((i) => i.kind === 'PRODUCT' && i.productId).map((i) => [i.productId!, i])).values()].map((i) => ({
      productId: i.productId!,
      name: i.name,
      icon: i.icon,
      reviewed: reviewed.has(i.productId!),
    }));
    const serviceOpen = services.length > 0 && !order.review;
    const productsOpen = products.some((p) => !p.reviewed);
    return {
      code: order.code,
      completedAt: order.completedAt?.toISOString() ?? null,
      hasService: services.length > 0,
      serviceLabel: services.map((i) => i.name).join(' + '),
      icon: services[0]?.icon ?? products[0]?.icon ?? 'scissor',
      barber: order.barber ? { name: fullName(order.barber), headline: order.barber.staffProfile?.headline ?? '', avatar: avatarFor(order.barber) } : null,
      products,
      alreadyReviewed: !serviceOpen && !productsOpen,
      serviceReviewed: !!order.review,
      canReview: order.status === 'COMPLETED' && (serviceOpen || productsOpen),
    };
  }

  async create(actor: Actor, code: string, input: z.infer<typeof reviewInput>) {
    const order = await this.prisma.order.findUnique({
      where: { code: code.toUpperCase() },
      include: { items: true, review: true, productReviews: { select: { productId: true } } },
    });
    if (!order || order.customerId !== actor.id) throw DomainError.notFound('Pedido');
    invariant(order.status === 'COMPLETED', 'not_completed', 'Você pode avaliar depois que o pedido for concluído.');
    const services = order.items.filter((i) => i.kind === 'SERVICE');
    const now = this.clock.now();
    let reviewId: string | null = null;

    if (services.length && !order.review) {
      invariant(input.serviceRating && input.barberRating, 'ratings_required', 'Dê nota ao serviço e a quem atendeu.');
      const review = Review.create(newId(), {
        orderId: order.id,
        customerId: actor.id,
        barberId: order.barberId,
        serviceId: services[0]!.serviceId,
        serviceLabel: services.map((i) => i.name).join(' + '),
        serviceRating: input.serviceRating,
        barberRating: input.barberRating,
        text: input.text,
        createdAt: now,
      });
      const s = review.snapshot;
      await this.prisma.review.create({
        data: {
          id: review.id,
          orderId: s.orderId,
          customerId: s.customerId,
          barberId: s.barberId,
          serviceId: s.serviceId,
          serviceLabel: s.serviceLabel,
          serviceRating: s.serviceRating,
          barberRating: s.barberRating,
          text: s.text,
          showOnHome: s.showOnHome,
          createdAt: s.createdAt,
        },
      });
      reviewId = review.id;
      await this.events.publish([new ReviewCreated(review.id, s.orderId, s.barberId, Math.min(s.serviceRating, s.barberRating))]);
    }

    // Produtos do pedido que ainda não foram avaliados.
    const bought = new Set(order.items.filter((i) => i.kind === 'PRODUCT').map((i) => i.productId));
    const done = new Set(order.productReviews.map((p) => p.productId));
    const fresh = input.products.filter((p) => bought.has(p.productId) && !done.has(p.productId));
    if (fresh.length) {
      await this.prisma.productReview.createMany({
        data: fresh.map((p) => ({ orderId: order.id, productId: p.productId, customerId: actor.id, rating: p.rating, text: p.text?.trim() || null, createdAt: now })),
      });
    }
    invariant(reviewId || fresh.length, 'already_reviewed', 'Você já avaliou este pedido. Obrigado!');
    return { id: reviewId, products: fresh.length };
  }

  /** Carrossel "O que dizem" da landing. */
  async homeCarousel(limit = 8) {
    const rows = await this.prisma.review.findMany({ where: { showOnHome: true }, include, orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map((r) => this.view(r));
  }

  async forBarber(barberId: string, filter: 'all' | 'five' | 'below4' | 'text', page = 1, pageSize = 30) {
    const where: Prisma.ReviewWhereInput = {
      barberId,
      barberRating: filter === 'five' ? 5 : filter === 'below4' ? { lt: 4 } : undefined,
      text: filter === 'text' ? { not: null } : undefined,
    };
    const [rows, total, dist, agg] = await Promise.all([
      this.prisma.review.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.review.count({ where }),
      this.prisma.review.groupBy({ by: ['barberRating'], where: { barberId }, _count: true }),
      this.prisma.review.aggregate({ where: { barberId }, _avg: { barberRating: true }, _count: true }),
    ]);
    return {
      average: agg._avg.barberRating ? Math.round(agg._avg.barberRating * 10) / 10 : null,
      count: agg._count,
      distribution: [5, 4, 3, 2, 1].map((n) => ({ rating: n, count: dist.find((d) => d.barberRating === n)?._count ?? 0 })),
      items: rows.map((r) => this.view(r)),
      total,
      page,
      pageSize,
    };
  }

  /** Avaliações de um profissional no perfil público, em páginas de 5. */
  async publicForBarber(barberId: string, page: number) {
    const res = await this.forBarber(barberId, 'all', page, 5);
    return {
      items: res.items.map((r) => ({ id: r.id, name: r.customer.name, avatar: r.customer.avatar, rating: r.barberRating, text: r.text ?? '', createdAt: r.createdAt })),
      total: res.total,
      page: res.page,
      pageSize: res.pageSize,
    };
  }

  async adminList(q: z.infer<typeof adminReviewsQuery>) {
    const tz = this.config.timeZone;
    const today = toDateKey(this.clock.now(), tz);
    const p = makePeriod(q.from ?? addDays(today, -36), q.to ?? today, tz);
    const where: Prisma.ReviewWhereInput = {
      createdAt: { gte: p.start, lt: p.end },
      barberId: q.barberId || undefined,
      showOnHome: q.onHome ? q.onHome === 'yes' : undefined,
      text: q.q ? this.prisma.contains(q.q) : undefined,
      ...(q.rating === '5' ? { serviceRating: 5, barberRating: 5 } : q.rating === '4' ? { serviceRating: 4 } : q.rating === 'below4' ? { OR: [{ serviceRating: { lt: 4 } }, { barberRating: { lt: 4 } }] } : {}),
    };
    const weekAgo = new Date(this.clock.now().getTime() - 7 * 86_400_000);
    const [rows, total, overall, onHome, below, belowWeek, reviewsCount, completed] = await Promise.all([
      this.prisma.review.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({ _avg: { serviceRating: true, barberRating: true }, _count: true }),
      this.prisma.review.count({ where: { showOnHome: true } }),
      this.prisma.review.count({ where: { OR: [{ serviceRating: { lt: 4 } }, { barberRating: { lt: 4 } }] } }),
      this.prisma.review.count({ where: { createdAt: { gte: weekAgo }, OR: [{ serviceRating: { lt: 4 } }, { barberRating: { lt: 4 } }] } }),
      this.prisma.review.count(),
      this.prisma.order.count({ where: { status: 'COMPLETED', type: 'APPOINTMENT', customerId: { not: null } } }),
    ]);
    const avg = overall._avg.serviceRating && overall._avg.barberRating ? (overall._avg.serviceRating + overall._avg.barberRating) / 2 : null;
    return {
      kpis: {
        average: avg ? Math.round(avg * 10) / 10 : null,
        count: overall._count,
        onHome,
        below4: below,
        below4Week: belowWeek,
        responseRatePct: completed ? Math.round((reviewsCount / completed) * 100) : 0,
      },
      period: { from: p.from, to: p.to },
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => this.view(r)),
    };
  }

  async setShowOnHome(id: string, show: boolean) {
    const row = await this.prisma.review.findUnique({ where: { id }, include });
    if (!row) throw DomainError.notFound('Avaliação');
    const review = this.toReview(row);
    review.setShowOnHome(show);
    await this.prisma.review.update({ where: { id }, data: { showOnHome: review.snapshot.showOnHome } });
    return { ok: true };
  }

  async reply(actor: Actor, id: string, text: string) {
    const row = await this.prisma.review.findUnique({ where: { id }, include });
    if (!row) throw DomainError.notFound('Avaliação');
    const review = this.toReview(row);
    review.replyWith(text, actor.id, this.clock.now());
    const s = review.snapshot;
    await this.prisma.review.update({ where: { id }, data: { reply: s.reply, repliedById: s.repliedById, repliedAt: s.repliedAt } });
    return { ok: true };
  }
}
