import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppConfig } from '@/config/app-config.service';
import { fullName } from '@/shared/domain/avatar';
import { addDays, toDateKey, weekdayOf } from '@/shared/domain/business-time';
import { eachDay, makePeriod, Period, previousPeriod } from '@/shared/domain/period';
import { Clock } from '@/shared/infrastructure/clock';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { SettingsService } from '@/modules/business/application/settings.service';

export const reportQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  method: z.enum(['PIX', 'CREDIT', 'DEBIT', 'COUNTER']).optional(),
  barberId: z.string().optional(),
  groupBy: z.enum(['day', 'week']).default('day'),
});
export type ReportQuery = z.infer<typeof reportQuery>;

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const METHOD_GROUP: Record<string, 'PIX' | 'CREDIT' | 'DEBIT' | 'COUNTER'> = {
  PIX: 'PIX',
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
  CASH: 'COUNTER',
  STORE_PIX: 'COUNTER',
  TERMINAL_DEBIT: 'COUNTER',
  TERMINAL_CREDIT: 'COUNTER',
};

/**
 * Relatórios do painel. Base: dinheiro que entrou (pagamentos confirmados no
 * período), estornos pela data do estorno, comissões dos pedidos concluídos.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  private period(q: ReportQuery): Period {
    const tz = this.config.timeZone;
    const today = toDateKey(this.clock.now(), tz);
    return makePeriod(q.from ?? addDays(today, -6), q.to ?? today, tz);
  }

  private async payments(p: Period, q: ReportQuery) {
    const rows = await this.prisma.payment.findMany({
      where: {
        status: { in: ['SUCCEEDED', 'REFUNDED'] },
        confirmedAt: { gte: p.start, lt: p.end },
        order: q.barberId ? { barberId: q.barberId } : undefined,
      },
      include: { order: { select: { id: true, barberId: true } } },
    });
    return rows.filter((r) => !q.method || METHOD_GROUP[r.method] === q.method);
  }

  private async refunds(p: Period, q: ReportQuery) {
    const rows = await this.prisma.payment.findMany({
      where: { refundedAt: { gte: p.start, lt: p.end }, order: q.barberId ? { barberId: q.barberId } : undefined },
      include: { order: { select: { id: true } } },
    });
    return rows.filter((r) => !q.method || METHOD_GROUP[r.method] === q.method);
  }

  private async commissions(p: Period, q: ReportQuery) {
    return this.prisma.commissionLine.findMany({
      where: { barberId: q.barberId || undefined, order: { completedAt: { gte: p.start, lt: p.end } } },
      include: { order: { select: { completedAt: true } } },
    });
  }

  private dayLabel(d: string, today: string) {
    return d === today ? `hoje ${d.slice(8, 10)}` : `${WD[weekdayOf(d)]} ${d.slice(8, 10)}`;
  }

  async overview(q: ReportQuery) {
    const tz = this.config.timeZone;
    const p = this.period(q);
    const prev = previousPeriod(p, tz);
    const today = toDateKey(this.clock.now(), tz);
    const [pay, prevPay, refunds, prevRefunds, cancelled, orders] = await Promise.all([
      this.payments(p, q),
      this.payments(prev, q),
      this.refunds(p, q),
      this.refunds(prev, q),
      this.prisma.order.count({ where: { status: 'CANCELLED', cancelledAt: { gte: p.start, lt: p.end }, paidCents: { gt: 0 } } }),
      this.prisma.order.findMany({
        where: { status: { in: ['SCHEDULED', 'IN_SERVICE', 'COMPLETED', 'NO_SHOW'] }, payments: { some: { confirmedAt: { gte: p.start, lt: p.end }, status: { in: ['SUCCEEDED', 'REFUNDED'] } } } },
        include: { items: true, barber: true },
      }),
    ]);
    const prevCancelled = await this.prisma.order.count({ where: { status: 'CANCELLED', cancelledAt: { gte: prev.start, lt: prev.end }, paidCents: { gt: 0 } } });
    const revenue = pay.reduce((s, x) => s + x.amountCents, 0);
    const prevRevenue = prevPay.reduce((s, x) => s + x.amountCents, 0);
    const paidOrders = new Set(pay.map((x) => x.orderId)).size;
    const prevPaidOrders = new Set(prevPay.map((x) => x.orderId)).size;
    const avg = paidOrders ? Math.round(revenue / paidOrders) : 0;
    const prevAvg = prevPaidOrders ? Math.round(prevRevenue / prevPaidOrders) : 0;

    const byDay = eachDay(p).map((d) => ({
      date: d,
      label: this.dayLabel(d, today),
      cents: pay.filter((x) => toDateKey(x.confirmedAt!, tz) === d).reduce((s, x) => s + x.amountCents, 0),
      today: d === today,
    }));

    const net = (i: { unitPriceCents: number; quantity: number; discountCents: number }) => i.unitPriceCents * i.quantity - i.discountCents;
    const cat = new Map<string, number>();
    const svc = new Map<string, { name: string; orders: number; cents: number }>();
    for (const o of orders) {
      for (const i of o.items) {
        if (i.kind !== 'SERVICE') continue;
        cat.set(i.categoryName, (cat.get(i.categoryName) ?? 0) + net(i));
        const cur = svc.get(i.name) ?? { name: i.name, orders: 0, cents: 0 };
        cur.orders += 1;
        cur.cents += net(i);
        svc.set(i.name, cur);
      }
    }
    const catTotal = [...cat.values()].reduce((s, v) => s + v, 0);

    const barbers = await this.prisma.user.findMany({ where: { roles: { contains: 'BARBER' }, active: true }, orderBy: { firstName: 'asc' } });
    const ratings = await this.prisma.review.groupBy({ by: ['barberId'], _avg: { barberRating: true } });
    const byBarber = barbers
      .map((b) => {
        const mine = orders.filter((o) => o.barberId === b.id);
        const rating = ratings.find((r) => r.barberId === b.id)?._avg.barberRating;
        return {
          id: b.id,
          name: fullName(b),
          appointments: mine.filter((o) => o.status === 'COMPLETED').length,
          rating: rating ? Math.round(rating * 10) / 10 : null,
          cents: mine.reduce((s, o) => s + o.totalCents, 0),
        };
      })
      .sort((a, b) => b.cents - a.cents);

    const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
    return {
      period: { from: p.from, to: p.to, label: p.label, previous: { from: prev.from, to: prev.to } },
      kpis: {
        revenueCents: revenue,
        revenueDeltaPct: pct(revenue, prevRevenue),
        paidOrders,
        paidOrdersDelta: paidOrders - prevPaidOrders,
        avgTicketCents: avg,
        avgTicketDeltaCents: avg - prevAvg,
        cancelled,
        cancelledDelta: cancelled - prevCancelled,
        refundedCents: refunds.reduce((s, r) => s + r.refundedCents, 0),
        prevRefundedCents: prevRefunds.reduce((s, r) => s + r.refundedCents, 0),
      },
      byDay,
      byCategory: [...cat.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, cents]) => ({ name, cents, pct: catTotal ? Math.round((cents / catTotal) * 100) : 0 })),
      topServices: [...svc.values()].sort((a, b) => b.orders - a.orders).slice(0, 5),
      byBarber,
    };
  }

  async sales(q: ReportQuery) {
    const tz = this.config.timeZone;
    const p = this.period(q);
    const today = toDateKey(this.clock.now(), tz);
    const [pay, refunds, lines, payment, barbersCount] = await Promise.all([
      this.payments(p, q),
      this.refunds(p, q),
      this.commissions(p, q),
      this.settings.get('payment'),
      this.prisma.user.count({ where: { roles: { contains: 'BARBER' }, active: true } }),
    ]);
    const days = eachDay(p);
    const buckets =
      q.groupBy === 'week'
        ? Array.from({ length: Math.ceil(days.length / 7) }, (_, i) => days.slice(i * 7, i * 7 + 7))
        : days.map((d) => [d]);
    const rows = buckets.map((bucket) => {
      const inBucket = (d: Date | null) => !!d && bucket.includes(toDateKey(d, tz));
      const dayPay = pay.filter((x) => inBucket(x.confirmedAt));
      const gross = dayPay.reduce((s, x) => s + x.amountCents, 0);
      const refunded = refunds.filter((x) => inBucket(x.refundedAt)).reduce((s, x) => s + x.refundedCents, 0);
      const fees = dayPay.reduce((s, x) => s + x.feeCents, 0);
      const commission = lines.filter((l) => inBucket(l.order.completedAt)).reduce((s, l) => s + l.amountCents, 0);
      const first = bucket[0]!;
      return {
        date: first,
        label: q.groupBy === 'week' ? `${first.slice(8, 10)}/${first.slice(5, 7)} a ${bucket.at(-1)!.slice(8, 10)}/${bucket.at(-1)!.slice(5, 7)}` : `${first === today ? 'hoje' : WD[weekdayOf(first)]}, ${first.slice(8, 10)}/${first.slice(5, 7)}`,
        orders: new Set(dayPay.map((x) => x.orderId)).size,
        grossCents: gross,
        refundsCents: refunded,
        feesCents: fees,
        commissionsCents: commission,
        netCents: gross - refunded - fees - commission,
      };
    });
    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (r[k] as number), 0);
    const gross = sum('grossCents');
    const net = sum('netCents');
    const byMethod = (['PIX', 'CREDIT', 'DEBIT', 'COUNTER'] as const).map((m) => ({
      method: m,
      cents: pay.filter((x) => METHOD_GROUP[x.method] === m).reduce((s, x) => s + x.amountCents, 0),
    }));
    let payout = today;
    while (weekdayOf(payout) !== 5) payout = addDays(payout, 1);
    return {
      period: { from: p.from, to: p.to, label: p.label },
      kpis: {
        grossCents: gross,
        paidOrders: new Set(pay.map((x) => x.orderId)).size,
        refundsCents: sum('refundsCents'),
        refundsCount: new Set(refunds.map((r) => r.orderId)).size,
        feesCents: sum('feesCents'),
        commissionsCents: sum('commissionsCents'),
        barbersCount,
        netCents: net,
        marginPct: gross ? Math.round((net / gross) * 1000) / 10 : 0,
      },
      byDay: rows.map((r) => ({ label: r.label, cents: r.grossCents, today: r.date === today })),
      byMethod,
      rows,
      nextPayout: payout,
      payoutSchedule: payment.payoutSchedule,
    };
  }

  async salesCsv(q: ReportQuery): Promise<string> {
    const data = await this.sales(q);
    const money = (c: number) => (c / 100).toFixed(2).replace('.', ',');
    const header = ['Dia', 'Pedidos', 'Bruto', 'Estornos', 'Taxas', 'Comissões', 'Líquido'];
    const lines = data.rows.map((r) => [r.label, String(r.orders), money(r.grossCents), money(r.refundsCents), money(r.feesCents), money(r.commissionsCents), money(r.netCents)].join(';'));
    return '﻿' + [header.join(';'), ...lines].join('\n');
  }
}
