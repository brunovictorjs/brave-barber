import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppConfig } from '@/config/app-config.service';
import { avatarFor, fullName } from '@/shared/domain/avatar';
import { addDays, formatDuration, parseHm, toDateKey, weekdayOf, zonedParts, formatHm } from '@/shared/domain/business-time';
import { DomainError, invariant } from '@/shared/domain/domain-error';
import { Money } from '@/shared/domain/money';
import { eachDay, Period, PeriodPreset, previousPeriod, resolvePeriod } from '@/shared/domain/period';
import { Clock } from '@/shared/infrastructure/clock';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { SettingsService } from '@/modules/business/application/settings.service';

export const periodInput = z.object({
  period: z.enum(['today', 'week', 'month', 'last_month', 'custom']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type PeriodInput = z.infer<typeof periodInput>;

export const ratesInput = z.object({
  serviceBps: z.number().int().min(0).max(10_000),
  productBps: z.number().int().min(0).max(10_000),
});

export const categoryRuleInput = z.object({
  categoryId: z.string().min(1),
  rateBps: z.number().int().min(0).max(10_000),
  reason: z.string().max(80).default(''),
});

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const PAYOUT_DAYS: Record<string, number> = { domingo: 0, segunda: 1, terça: 2, terca: 2, quarta: 3, quinta: 4, sexta: 5, sábado: 6, sabado: 6 };
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function pctDelta(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Leituras de comissão: "Meus ganhos" do barbeiro e a tabela do admin. */
@Injectable()
export class CommissionQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  private period(input: PeriodInput): Period {
    return resolvePeriod(input.period as PeriodPreset, input, this.clock.now(), this.config.timeZone);
  }

  private async linesIn(p: Period, barberId?: string) {
    return this.prisma.commissionLine.findMany({
      where: { barberId, order: { completedAt: { gte: p.start, lt: p.end } } },
      include: { order: { select: { completedAt: true } } },
    });
  }

  /** Minutos em que a casa fica aberta no período (para a taxa de ocupação). */
  private async openMinutes(p: Period): Promise<number> {
    const hours = await this.settings.get('hours');
    let total = 0;
    for (const day of eachDay(p)) {
      const h = hours.weekly.find((w) => w.weekday === weekdayOf(day));
      if (!h?.open || !h.close) continue;
      total += parseHm(h.close) - parseHm(h.open);
      if (h.breakStart && h.breakEnd) total -= parseHm(h.breakEnd) - parseHm(h.breakStart);
    }
    return total;
  }

  private async nextPayoutLabel(): Promise<string> {
    const { payoutDay } = await this.settings.get('commission');
    const target = PAYOUT_DAYS[payoutDay.toLowerCase().split('-')[0]!.trim()] ?? 5;
    const today = toDateKey(this.clock.now(), this.config.timeZone);
    let day = today;
    while (weekdayOf(day) !== target) day = addDays(day, 1);
    const [, m, d] = day.split('-').map(Number);
    return `Repasse na ${payoutDay.split('-')[0]}, ${d} ${MONTH_SHORT[m! - 1]}`;
  }

  async earnings(barberId: string, input: PeriodInput, list: { filter: 'all' | 'completed' | 'cancelled'; page: number }) {
    const tz = this.config.timeZone;
    const p = this.period(input);
    const prev = previousPeriod(p, tz);
    const profile = await this.prisma.staffProfile.findUnique({ where: { userId: barberId } });
    invariant(profile, 'not_staff', 'Seu cadastro de profissional não foi encontrado.');

    const [lines, prevLines] = await Promise.all([this.linesIn(p, barberId), this.linesIn(prev, barberId)]);
    const sum = (ls: typeof lines, kind?: string) => ls.filter((l) => !kind || l.kind === kind).reduce((s, l) => s + l.amountCents, 0);
    const base = (ls: typeof lines, kind: string) => ls.filter((l) => l.kind === kind).reduce((s, l) => s + l.baseCents, 0);

    const ordersWhere = (period: Period) => ({
      barberId,
      status: 'COMPLETED',
      completedAt: { gte: period.start, lt: period.end },
    });
    const [orders, prevOrders, rating] = await Promise.all([
      this.prisma.order.findMany({ where: ordersWhere(p), include: { items: true } }),
      this.prisma.order.findMany({ where: ordersWhere(prev), select: { totalCents: true } }),
      this.prisma.review.aggregate({ where: { barberId }, _avg: { barberRating: true }, _count: true }),
    ]);
    const chairSeconds = orders.reduce((s, o) => {
      if (!o.startedAt || !o.completedAt) return s;
      return s + Math.max(0, (o.completedAt.getTime() - o.startedAt.getTime()) / 1000 - o.pausedSeconds);
    }, 0);
    const openMin = await this.openMinutes(p);
    const avg = (os: { totalCents: number }[]) => (os.length ? Math.round(os.reduce((s, o) => s + o.totalCents, 0) / os.length) : 0);

    // Últimos 7 dias, por dia de conclusão.
    const today = toDateKey(this.clock.now(), tz);
    const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const weekLines = await this.prisma.commissionLine.findMany({
      where: { barberId, order: { completedAt: { gte: new Date(this.clock.now().getTime() - 8 * 86_400_000) } } },
      include: { order: { select: { completedAt: true } } },
    });
    const byDay = last7.map((d) => ({
      date: d,
      label: d === today ? 'hoje' : WEEKDAY_SHORT[weekdayOf(d)]!,
      cents: weekLines.filter((l) => l.order.completedAt && toDateKey(l.order.completedAt, tz) === d).reduce((s, l) => s + l.amountCents, 0),
    }));

    // De onde vem o dinheiro: receita de serviços por categoria.
    const cat = new Map<string, number>();
    for (const o of orders) for (const i of o.items) if (i.kind === 'SERVICE') cat.set(i.categoryName, (cat.get(i.categoryName) ?? 0) + i.unitPriceCents * i.quantity - i.discountCents);
    const catTotal = [...cat.values()].reduce((s, v) => s + v, 0);
    const byCategory = [...cat.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, cents]) => ({ name, cents, pct: catTotal ? Math.round((cents / catTotal) * 100) : 0 }));

    // Atendimentos do período.
    const statusFilter = list.filter === 'completed' ? ['COMPLETED'] : list.filter === 'cancelled' ? ['CANCELLED'] : ['COMPLETED', 'CANCELLED'];
    const listWhere = {
      barberId,
      status: { in: statusFilter },
      OR: [
        { completedAt: { gte: p.start, lt: p.end } },
        { cancelledAt: { gte: p.start, lt: p.end }, paidCents: { gt: 0 } },
      ],
    };
    const [rows, counts] = await Promise.all([
      this.prisma.order.findMany({
        where: listWhere,
        include: { items: true, commissionLines: { where: { barberId } }, review: true, customer: true },
        orderBy: [{ completedAt: 'desc' }, { cancelledAt: 'desc' }],
        skip: (list.page - 1) * 10,
        take: 10,
      }),
      Promise.all([
        this.prisma.order.count({ where: { ...listWhere, status: { in: ['COMPLETED', 'CANCELLED'] } } }),
        this.prisma.order.count({ where: { ...listWhere, status: { in: ['COMPLETED'] } } }),
        this.prisma.order.count({ where: { ...listWhere, status: { in: ['CANCELLED'] } } }),
      ]),
    ]);

    const items = rows.map((o) => {
      const when = o.completedAt ?? o.cancelledAt ?? o.createdAt;
      const parts = zonedParts(when, tz);
      const whenLabel = toDateKey(when, tz) === today ? `hoje ${formatHm(parts.hour * 60 + parts.minute)}` : toDateKey(when, tz) === addDays(today, -1) ? `ontem ${formatHm(parts.hour * 60 + parts.minute)}` : `${parts.day} ${MONTH_SHORT[parts.month - 1]} ${formatHm(parts.hour * 60 + parts.minute)}`;
      const service = o.commissionLines.filter((l) => l.kind === 'SERVICE').reduce((s, l) => s + l.amountCents, 0);
      const product = o.commissionLines.filter((l) => l.kind === 'PRODUCT').reduce((s, l) => s + l.amountCents, 0);
      const realMin = o.startedAt && o.completedAt ? Math.round(((o.completedAt.getTime() - o.startedAt.getTime()) / 1000 - o.pausedSeconds) / 60) : null;
      const plannedMin = o.items.filter((i) => i.kind === 'SERVICE').reduce((s, i) => s + i.durationMin, 0);
      const name = o.customer ? fullName(o.customer) : o.customerName;
      return {
        id: o.id,
        code: o.origin === 'WALK_IN' ? null : o.code,
        status: o.status,
        origin: o.origin,
        customerName: name,
        avatar: avatarFor({ id: o.customerId ?? o.id, name }),
        summary: `${o.items.map((i) => i.name).join(' + ')} · ${whenLabel}`,
        commissionCents: service + product,
        detail:
          o.status === 'CANCELLED'
            ? 'estornado'
            : product
              ? `${Money.format(service)} + ${Money.format(product)} produto`
              : `de ${Money.format(o.totalCents)}`,
        timeLabel: realMin !== null ? `${formatDuration(realMin)} reais · ${formatDuration(plannedMin)} previstos` : null,
        rating: o.review ? (o.review.barberRating + 0).toFixed(1).replace('.', ',') : null,
      };
    });

    const total = sum(lines);
    return {
      period: { from: p.from, to: p.to, label: p.label },
      totalCents: total,
      deltaPct: pctDelta(total, sum(prevLines)),
      service: { cents: sum(lines, 'SERVICE'), baseCents: base(lines, 'SERVICE'), rateBps: profile.serviceCommissionBps },
      product: { cents: sum(lines, 'PRODUCT'), baseCents: base(lines, 'PRODUCT'), rateBps: profile.productCommissionBps },
      payoutLabel: await this.nextPayoutLabel(),
      kpis: {
        appointments: orders.length,
        appointmentsDelta: orders.length - prevOrders.length,
        avgTicketCents: avg(orders),
        avgTicketDeltaCents: avg(orders) - avg(prevOrders),
        chairHours: Math.round(chairSeconds / 3600),
        occupancyPct: openMin ? Math.min(100, Math.round((chairSeconds / 60 / openMin) * 100)) : 0,
        rating: rating._avg.barberRating ? Math.round(rating._avg.barberRating * 10) / 10 : null,
        ratingCount: rating._count,
      },
      byDay,
      byCategory,
      list: { items, page: list.page, pageSize: 10, counts: { all: counts[0], completed: counts[1], cancelled: counts[2] } },
    };
  }

  /** Tabela "Comissão por profissional" das configurações. */
  async overview(input: PeriodInput) {
    const p = this.period(input);
    const barbers = await this.prisma.user.findMany({
      where: { roles: { contains: 'BARBER' }, active: true },
      include: { staffProfile: true },
      orderBy: { firstName: 'asc' },
    });
    const [lines, orders, rules, categories, commission] = await Promise.all([
      this.linesIn(p),
      this.prisma.order.findMany({
        where: { status: 'COMPLETED', completedAt: { gte: p.start, lt: p.end }, barberId: { in: barbers.map((b) => b.id) } },
        include: { items: true },
      }),
      this.prisma.commissionCategoryRule.findMany({ include: { category: true } }),
      this.prisma.category.findMany({ where: { kind: 'SERVICE' }, orderBy: { position: 'asc' } }),
      this.settings.get('commission'),
    ]);
    const rows = barbers.map((b) => {
      const mine = orders.filter((o) => o.barberId === b.id);
      const services = mine.flatMap((o) => o.items.filter((i) => i.kind === 'SERVICE'));
      const products = orders.flatMap((o) => o.items.filter((i) => i.kind === 'PRODUCT' && i.addedById === b.id));
      const net = (i: { unitPriceCents: number; quantity: number; discountCents: number }) => i.unitPriceCents * i.quantity - i.discountCents;
      const myLines = lines.filter((l) => l.barberId === b.id);
      return {
        id: b.id,
        name: fullName(b),
        avatar: avatarFor(b),
        serviceBps: b.staffProfile?.serviceCommissionBps ?? commission.defaultServiceBps,
        productBps: b.staffProfile?.productCommissionBps ?? commission.defaultProductBps,
        appointments: mine.length,
        servicesCents: services.reduce((s, i) => s + net(i), 0),
        productsCents: products.reduce((s, i) => s + net(i), 0),
        payoutCents: myLines.reduce((s, l) => s + l.amountCents, 0),
      };
    });
    return {
      period: { from: p.from, to: p.to, label: p.label },
      rows,
      totals: {
        serviceCents: lines.filter((l) => l.kind === 'SERVICE').reduce((s, l) => s + l.amountCents, 0),
        productCents: lines.filter((l) => l.kind === 'PRODUCT').reduce((s, l) => s + l.amountCents, 0),
        totalCents: lines.reduce((s, l) => s + l.amountCents, 0),
      },
      categoryRules: rules.map((r) => ({ categoryId: r.categoryId, categoryName: r.category.name, rateBps: r.rateBps, reason: r.reason })),
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
    };
  }

  async setRates(barberId: string, rates: z.infer<typeof ratesInput>): Promise<void> {
    const profile = await this.prisma.staffProfile.findUnique({ where: { userId: barberId } });
    if (!profile) throw DomainError.notFound('Profissional');
    await this.prisma.staffProfile.update({
      where: { userId: barberId },
      data: { serviceCommissionBps: rates.serviceBps, productCommissionBps: rates.productBps },
    });
  }

  async upsertCategoryRule(input: z.infer<typeof categoryRuleInput>): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { id: input.categoryId } });
    invariant(category?.kind === 'SERVICE', 'invalid_category', 'A exceção vale só para categorias de serviço.');
    await this.prisma.commissionCategoryRule.upsert({
      where: { categoryId: input.categoryId },
      create: input,
      update: { rateBps: input.rateBps, reason: input.reason },
    });
  }

  async removeCategoryRule(categoryId: string): Promise<void> {
    await this.prisma.commissionCategoryRule.deleteMany({ where: { categoryId } });
  }
}
