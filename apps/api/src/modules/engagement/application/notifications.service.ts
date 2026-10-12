import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfig } from '@/config/app-config.service';
import { fullName } from '@/shared/domain/avatar';
import { addDays, dayRange, formatHm, formatShortDateTime, minutesOfDay, parseHm, toDateKey } from '@/shared/domain/business-time';
import { Money } from '@/shared/domain/money';
import { Clock } from '@/shared/infrastructure/clock';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { SettingsService } from '@/modules/business/application/settings.service';
import type { NotificationEvent } from '@/modules/business/domain/settings';
import { Mailer } from './mailer';

interface OrderEvt {
  orderId: string;
  payload?: Record<string, unknown>;
}

/**
 * Avisos: transforma eventos de domínio em notificações no app (barbeiro) e
 * e-mails, respeitando a matriz "quem é avisado de quê" das configurações.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly settings: SettingsService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  // ── Caixa de avisos ─────────────────────────────────────────────────────

  async list(userId: string) {
    const rows = await this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 40 });
    return {
      unread: rows.filter((r) => !r.readAt).length,
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        tone: r.tone,
        icon: r.icon,
        title: r.title,
        body: r.body,
        link: r.link,
        read: !!r.readAt,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: this.clock.now() } });
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { readAt: this.clock.now() } });
  }

  async emailLog() {
    const rows = await this.prisma.emailLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 });
    return {
      driver: this.config.get('MAIL_DRIVER'),
      redirectTo: this.config.get('MAIL_REDIRECT_TO') || null,
      items: rows.map((r) => ({ id: r.id, event: r.event, to: r.to, subject: r.subject, status: r.status, error: r.error, createdAt: r.createdAt.toISOString() })),
    };
  }

  /** "Enviar e-mail de teste" nas configurações: confere se o envio está funcionando. */
  async sendTest(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.mailer.send({
      event: 'test',
      to: [user.email],
      subject: 'E-mail de teste',
      lines: [
        ['Enviado para', user.email],
        ['Driver', this.config.get('MAIL_DRIVER') === 'resend' ? 'Resend' : 'Somente registro (log)'],
        ['Quando', formatShortDateTime(this.clock.now(), this.config.timeZone)],
      ],
      cta: { label: 'Abrir o painel', url: `${this.config.get('WEB_URL')}/admin` },
    });
    const last = await this.prisma.emailLog.findFirst({ where: { event: 'test' }, orderBy: { createdAt: 'desc' } });
    return { status: last?.status ?? 'SKIPPED', error: last?.error ?? null, to: last?.to ?? user.email };
  }

  private async push(userIds: (string | null | undefined)[], n: { type: string; tone: string; icon: string; title: string; body: string; link?: string }) {
    const ids = [...new Set(userIds.filter((id): id is string => !!id))];
    if (!ids.length) return;
    await this.prisma.notification.createMany({ data: ids.map((userId) => ({ userId, ...n, link: n.link ?? null })) });
  }

  // ── Destinatários ───────────────────────────────────────────────────────

  private async admins() {
    return this.prisma.user.findMany({ where: { active: true, roles: { contains: 'ADMIN' } }, select: { id: true, email: true } });
  }

  private async channels(event: NotificationEvent) {
    const settings = await this.settings.get('notifications');
    return settings.matrix[event];
  }

  private async orderContext(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true, barber: true, customer: true } });
    if (!order) return null;
    const tz = this.config.timeZone;
    return {
      order,
      customerName: order.customer ? fullName(order.customer) : order.customerName,
      when: order.scheduledStart ? formatShortDateTime(order.scheduledStart, tz) : '—',
      items: order.items.map((i) => i.name).join(' + '),
      link: `/barbeiro`,
    };
  }

  private async dispatch(event: NotificationEvent, orderId: string, build: (ctx: NonNullable<Awaited<ReturnType<NotificationsService['orderContext']>>>) => {
    subject: string;
    inApp?: { tone: string; icon: string; title: string; body: string } | null;
    lines?: [string, string][];
  }) {
    const ctx = await this.orderContext(orderId);
    if (!ctx) return;
    const ch = await this.channels(event);
    const msg = build(ctx);
    const lines: [string, string][] = msg.lines ?? [
      ['Cliente', ctx.customerName],
      ['Quando', ctx.when],
      ['Serviços', ctx.items],
      ['Código', ctx.order.code],
    ];
    if (msg.inApp && ctx.order.barberId) await this.push([ctx.order.barberId], { type: event, ...msg.inApp, link: ctx.link });
    const to: string[] = [];
    if (ch.staffEmail && ctx.order.barber) to.push(ctx.order.barber.email);
    if (ch.adminEmail) to.push(...(await this.admins()).map((a) => a.email));
    if (to.length) await this.mailer.send({ event, to, subject: msg.subject, lines, cta: { label: 'Abrir na agenda', url: `${this.config.get('WEB_URL')}/barbeiro` } });
    if (ch.clientEmail && ctx.order.customer) {
      await this.mailer.send({ event: `${event}:client`, to: [ctx.order.customer.email], subject: msg.subject, lines });
    }
  }

  // ── Eventos de pedido ───────────────────────────────────────────────────

  @OnEvent('order.booked')
  async onBooked(e: OrderEvt) {
    await this.dispatch('order_paid', e.orderId, (c) => {
      const cash = !!e.payload?.cash;
      const walkIn = !!e.payload?.walkIn;
      return {
        subject: walkIn ? `Pedido avulso ${c.order.code} na sua agenda` : cash ? `Novo horário reservado (dinheiro) · ${c.order.code}` : `Novo pedido pago · ${c.order.code}`,
        inApp: {
          tone: cash || walkIn ? 'info' : 'ok',
          icon: walkIn ? 'plus' : cash ? 'money' : 'check',
          title: walkIn ? `Avulso ${c.order.code} · ${c.customerName}` : cash ? `Pedido ${c.order.code} reservado · dinheiro` : `Pedido ${c.order.code} pago`,
          body: `${c.customerName} · ${c.when}`,
        },
      };
    });
  }

  @OnEvent('order.cancelled')
  async onCancelled(e: OrderEvt) {
    const refund = Number(e.payload?.refundCents ?? 0);
    await this.dispatch('order_cancelled', e.orderId, (c) => ({
      subject: `Pedido ${c.order.code} cancelado`,
      inApp:
        c.order.status === 'CANCELLED' && c.order.paidCents + refund > 0
          ? { tone: 'bad', icon: 'refund', title: `Pedido ${c.order.code} cancelado`, body: refund ? `Reembolso de ${Money.format(refund)} emitido · ${c.when} liberou` : `${c.when} liberou` }
          : null,
      lines: [
        ['Cliente', c.customerName],
        ['Quando', c.when],
        ['Estorno', refund ? Money.format(refund) : 'sem valor a devolver'],
      ],
    }));
  }

  @OnEvent('order.late')
  async onLate(e: OrderEvt) {
    const at = e.payload?.fitInAt ? new Date(String(e.payload.fitInAt)) : null;
    await this.dispatch('customer_late', e.orderId, (c) => {
      const minutes = c.order.scheduledStart ? Math.max(0, Math.floor((this.clock.now().getTime() - c.order.scheduledStart.getTime()) / 60_000)) : 0;
      const fit = at ? formatHm(minutesOfDay(at, this.config.timeZone)) : null;
      return {
        subject: `Cliente atrasou · ${c.order.code}`,
        inApp: { tone: 'warn', icon: 'clock', title: `${c.customerName} está ${minutes} min atrasad${c.customerName.endsWith('a') ? 'a' : 'o'}`, body: fit ? `Encaixe sugerido às ${fit}` : 'Sem folga para encaixe hoje' },
      };
    });
  }

  @OnEvent('order.started')
  async onStarted(e: OrderEvt) {
    const ch = await this.channels('service_started');
    if (ch.clientPush) this.logger.debug(`Push ao cliente: atendimento iniciado (${e.orderId})`);
  }

  @OnEvent('order.completed')
  async onCompleted(e: OrderEvt) {
    await this.dispatch('order_completed', e.orderId, (c) => ({
      subject: `Pedido ${c.order.code} concluído`,
      inApp: null,
      lines: [
        ['Cliente', c.customerName],
        ['Serviços', c.items],
        ['Total', Money.format(c.order.totalCents)],
      ],
    }));
  }

  @OnEvent('order.refunded')
  async onRefunded(e: OrderEvt) {
    await this.dispatch('refund_completed', e.orderId, (c) => ({
      subject: `Estorno concluído · ${c.order.code}`,
      inApp: null,
      lines: [
        ['Cliente', c.customerName],
        ['Valor', Money.format(Number(e.payload?.amountCents ?? 0))],
      ],
    }));
  }

  @OnEvent('order.receipt_requested')
  async onReceipt(e: OrderEvt) {
    const ctx = await this.orderContext(e.orderId);
    if (!ctx?.order.customer) return;
    await this.mailer.send({
      event: 'receipt',
      to: [ctx.order.customer.email],
      subject: `Comprovante do pedido ${ctx.order.code}`,
      lines: [
        ['Serviços', ctx.items],
        ['Quando', ctx.when],
        ['Pago', Money.format(ctx.order.paidCents)],
      ],
    });
  }

  @OnEvent('review.created')
  async onReview(e: { reviewId: string; barberId: string | null; lowestRating: number }) {
    const review = await this.prisma.review.findUnique({ where: { id: e.reviewId }, include: { customer: true } });
    if (!review) return;
    const ch = await this.channels('review_received');
    const name = fullName(review.customer);
    if (e.barberId) {
      await this.push([e.barberId], {
        type: 'review_received',
        tone: 'n',
        icon: 'star',
        title: review.barberRating === 5 ? 'Você recebeu 5 estrelas' : `Nova avaliação: ${review.barberRating} estrela${review.barberRating > 1 ? 's' : ''}`,
        body: `${name} · ${review.serviceLabel}`,
        link: '/barbeiro/perfil',
      });
    }
    const lines: [string, string][] = [
      ['Cliente', name],
      ['Serviço', `${review.serviceLabel} · ${review.serviceRating}/5`],
      ['Profissional', `${review.barberRating}/5`],
      ['Texto', review.text ?? 'sem texto'],
    ];
    const to: string[] = [];
    if (ch.adminEmail) to.push(...(await this.admins()).map((a) => a.email));
    if (to.length) await this.mailer.send({ event: 'review_received', to, subject: 'Nova avaliação recebida', lines });
    if (e.lowestRating < 3 && (await this.channels('review_low')).adminEmail) {
      await this.mailer.send({ event: 'review_low', to: (await this.admins()).map((a) => a.email), subject: 'Alerta: avaliação abaixo de 3', lines });
    }
  }

  // ── Rotinas ─────────────────────────────────────────────────────────────

  /** Lembretes ao cliente (24 h e 2 h antes, configuráveis) e aviso ao barbeiro. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reminders() {
    const settings = await this.settings.get('notifications');
    const now = this.clock.now();
    const windows: [string, number][] = [
      ['reminder_first', settings.reminders.firstHoursBefore * 60],
      ['reminder_second', settings.reminders.secondHoursBefore * 60],
      ['barber_notice', settings.reminders.barberMinutesBefore],
    ];
    for (const [kind, minutesBefore] of windows) {
      if (minutesBefore <= 0) continue;
      const from = new Date(now.getTime() + (minutesBefore - 5) * 60_000);
      const to = new Date(now.getTime() + minutesBefore * 60_000);
      const orders = await this.prisma.order.findMany({
        where: { status: 'SCHEDULED', type: 'APPOINTMENT', scheduledStart: { gt: from, lte: to } },
        include: { customer: true, barber: true, items: true },
      });
      for (const o of orders) {
        const key = `${kind}:${o.id}`;
        if (await this.prisma.emailLog.findFirst({ where: { event: key } })) continue;
        const when = formatShortDateTime(o.scheduledStart!, this.config.timeZone);
        if (kind === 'barber_notice') {
          await this.push([o.barberId], { type: 'reminder', tone: 'n', icon: 'clock', title: `${o.customerName || 'Cliente'} às ${when.split('· ')[1]}`, body: o.items.map((i) => i.name).join(' + ') });
          await this.prisma.emailLog.create({ data: { event: key, to: o.barber?.email ?? '-', subject: 'Aviso ao barbeiro', status: 'SKIPPED' } });
          continue;
        }
        const ch = settings.matrix.reminder;
        if (ch.clientEmail && o.customer) {
          await this.mailer.send({ event: key, to: [o.customer.email], subject: `Lembrete: seu horário ${when}`, lines: [['Quando', when], ['Código do pedido', o.code]] });
        } else {
          await this.prisma.emailLog.create({ data: { event: key, to: o.customer?.email ?? '-', subject: 'Lembrete', status: 'SKIPPED' } });
        }
      }
    }
  }

  /** Resumo do dia seguinte, no horário configurado. */
  @Cron(CronExpression.EVERY_MINUTE)
  async dailySummary() {
    const settings = await this.settings.get('notifications');
    const tz = this.config.timeZone;
    const now = this.clock.now();
    if (minutesOfDay(now, tz) !== parseHm(settings.reminders.dailySummaryAt)) return;
    const tomorrow = addDays(toDateKey(now, tz), 1);
    const key = `daily_summary:${tomorrow}`;
    if (await this.prisma.emailLog.findFirst({ where: { event: key } })) return;
    const { start, end } = dayRange(tomorrow, tz);
    const orders = await this.prisma.order.findMany({ where: { status: 'SCHEDULED', scheduledStart: { gte: start, lt: end } }, include: { barber: true } });
    const ch = settings.matrix.daily_summary;
    const byBarber = new Map<string, typeof orders>();
    for (const o of orders) if (o.barber) byBarber.set(o.barber.email, [...(byBarber.get(o.barber.email) ?? []), o]);
    if (ch.staffEmail) {
      for (const [email, list] of byBarber) {
        await this.mailer.send({ event: key, to: [email], subject: `Sua agenda de amanhã: ${list.length} atendimento${list.length > 1 ? 's' : ''}`, lines: list.map((o) => [formatHm(minutesOfDay(o.scheduledStart!, tz)), o.customerName]) });
      }
    }
    if (ch.adminEmail) {
      await this.mailer.send({ event: key, to: (await this.admins()).map((a) => a.email), subject: `Agenda de amanhã: ${orders.length} atendimentos`, lines: [['Pedidos', String(orders.length)]] });
    }
    if (!ch.staffEmail && !ch.adminEmail) await this.prisma.emailLog.create({ data: { event: key, to: '-', subject: 'Resumo do dia', status: 'SKIPPED' } });
  }
}
