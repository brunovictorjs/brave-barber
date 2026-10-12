import { Injectable } from '@nestjs/common';
import { Clock } from '@/shared/infrastructure/clock';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { fullName } from '@/shared/domain/avatar';
import { BarberSummary, BookedAppointment, OccupancyReader } from '../domain/occupancy';

@Injectable()
export class PrismaOccupancyReader extends OccupancyReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async busyBetween(from: Date, to: Date, opts: { ignoreOrderId?: string } = {}) {
    const now = this.clock.now();
    const orders = await this.prisma.order.findMany({
      where: {
        barberId: { not: null },
        type: 'APPOINTMENT',
        id: opts.ignoreOrderId ? { not: opts.ignoreOrderId } : undefined,
        scheduledStart: { lt: to },
        scheduledEnd: { gt: from },
        OR: [
          { status: { in: ['SCHEDULED', 'IN_SERVICE', 'COMPLETED'] } },
          // Reserva enquanto o Pix/cartão não confirma.
          { status: 'PENDING_PAYMENT', holdExpiresAt: { gt: now } },
        ],
      },
      select: { barberId: true, scheduledStart: true, scheduledEnd: true, status: true, startedAt: true },
    });
    const map = new Map<string, { start: Date; end: Date }[]>();
    for (const o of orders) {
      // Atendimento que passou do previsto continua ocupando a cadeira até agora.
      const end = o.status === 'IN_SERVICE' && o.scheduledEnd! < now ? now : o.scheduledEnd!;
      const list = map.get(o.barberId!) ?? [];
      list.push({ start: o.scheduledStart!, end });
      map.set(o.barberId!, list);
    }
    return map;
  }

  private toSummary(u: { id: string; firstName: string; lastName: string; avatarUrl: string | null; staffProfile: { headline: string } | null }): BarberSummary {
    return { id: u.id, name: fullName(u), firstName: u.firstName, headline: u.staffProfile?.headline ?? '', avatarUrl: u.avatarUrl };
  }

  async eligibleBarbers(serviceIds: string[]): Promise<BarberSummary[]> {
    const barbers = await this.prisma.user.findMany({
      where: {
        active: true,
        roles: { contains: 'BARBER' },
        AND: serviceIds.map((serviceId) => ({ serviceSkills: { some: { serviceId } } })),
      },
      include: { staffProfile: { select: { headline: true } } },
      orderBy: { firstName: 'asc' },
    });
    return barbers.map((b) => this.toSummary(b));
  }

  async totalDuration(serviceIds: string[]): Promise<number> {
    if (!serviceIds.length) return 0;
    const services = await this.prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, durationMin: true } });
    return serviceIds.reduce((sum, id) => sum + (services.find((s) => s.id === id)?.durationMin ?? 0), 0);
  }

  async shortestServiceDuration(): Promise<number> {
    const s = await this.prisma.service.findFirst({ where: { status: 'ACTIVE' }, orderBy: { durationMin: 'asc' }, select: { durationMin: true } });
    return s?.durationMin ?? 30;
  }

  async ratings(barberIds: string[]) {
    const rows = await this.prisma.review.groupBy({
      by: ['barberId'],
      where: { barberId: { in: barberIds } },
      _avg: { barberRating: true },
      _count: true,
    });
    return new Map(
      rows.map((r) => [r.barberId!, { average: r._avg.barberRating ? Math.round(r._avg.barberRating * 10) / 10 : null, count: r._count }]),
    );
  }

  async activeBarbers(): Promise<BarberSummary[]> {
    const barbers = await this.prisma.user.findMany({
      where: { active: true, roles: { contains: 'BARBER' } },
      include: { staffProfile: { select: { headline: true } } },
      orderBy: { firstName: 'asc' },
    });
    return barbers.map((b) => this.toSummary(b));
  }

  async upcomingAppointments(barberId: string, from: Date): Promise<BookedAppointment[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        barberId,
        type: 'APPOINTMENT',
        scheduledStart: { gte: from },
        OR: [{ status: 'SCHEDULED' }, { status: 'PENDING_PAYMENT', holdExpiresAt: { gt: this.clock.now() } }],
      },
      select: {
        id: true,
        code: true,
        customerName: true,
        scheduledStart: true,
        scheduledEnd: true,
        customer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { scheduledStart: 'asc' },
    });
    return orders.map((o) => ({
      orderId: o.id,
      code: o.code,
      customerName: o.customerName || (o.customer ? fullName(o.customer) : 'Cliente'),
      start: o.scheduledStart!,
      end: o.scheduledEnd!,
    }));
  }
}
