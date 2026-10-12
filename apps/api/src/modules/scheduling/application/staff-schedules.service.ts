import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppConfig } from '@/config/app-config.service';
import { avatarFor, fullName } from '@/shared/domain/avatar';
import { DateKey, dayRange, formatHm, minutesOfDay, parseHm, toDateKey, weekdayOf, zonedTime } from '@/shared/domain/business-time';
import { DomainError, invariant } from '@/shared/domain/domain-error';
import { parseRoles } from '@/shared/domain/roles';
import type { Actor } from '@/shared/presentation/auth';
import { Clock } from '@/shared/infrastructure/clock';
import { parseJson, toJson } from '@/shared/infrastructure/json';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { ClosuresService } from '@/modules/business/application/closures.service';
import { SettingsService } from '@/modules/business/application/settings.service';
import type { WeekdayHours } from '@/modules/business/domain/settings';
import { DaySchedule, fitsWindows, Interval } from '../domain/availability';
import { OccupancyReader } from '../domain/occupancy';
import { DayPeriod, emptyWeek, PeriodKind, StaffHours, staffWeekday, StaffWeekday, workWindows } from '../domain/staff-schedule';

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Informe data e hora');

export const staffHoursInput = z.object({
  custom: z.boolean(),
  weekly: z.array(staffWeekday).length(7),
});

export const staffPeriodInput = z.object({
  kind: z.enum(['OPEN', 'CLOSED']),
  startsAt: localDateTime,
  endsAt: localDateTime,
  reason: z.string().trim().min(2, 'Diga o motivo'),
});

export const staffPeriodUpdateInput = staffPeriodInput.omit({ kind: true });

interface PeriodRow {
  id: string;
  barberId: string;
  kind: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
}

/** Troca a configuração de um profissional por uma candidata (para checar conflitos antes de salvar). */
interface Candidate {
  barberId: string;
  hours?: StaffHours;
  periods?: PeriodRow[];
}

export function toSchedule(h: WeekdayHours | undefined): DaySchedule | null {
  if (!h?.open || !h.close) return null;
  return {
    open: parseHm(h.open),
    close: parseHm(h.close),
    breakStart: h.breakStart ? parseHm(h.breakStart) : null,
    breakEnd: h.breakEnd ? parseHm(h.breakEnd) : null,
  };
}

function hoursOf(profile: { customHours: boolean; weeklyHours: string } | null | undefined): StaffHours {
  if (!profile) return { custom: false, weekly: emptyWeek() };
  const stored = parseJson<StaffWeekday[]>(profile.weeklyHours, []);
  const weekly = emptyWeek().map((d) => stored.find((w) => w.weekday === d.weekday) ?? d);
  return { custom: profile.customHours, weekly };
}

/**
 * Agenda da equipe: em que janelas cada profissional atende, a semana própria
 * de cada um e os períodos em que a agenda dele abre ou fecha.
 */
@Injectable()
export class StaffSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly closures: ClosuresService,
    private readonly occupancy: OccupancyReader,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  private get tz(): string {
    return this.config.timeZone;
  }

  /** Horário da casa nos dias pedidos (null = fechada). */
  async houseSchedules(dates: DateKey[]): Promise<Map<DateKey, DaySchedule | null>> {
    const sorted = [...dates].sort();
    const [hours, closed] = await Promise.all([
      this.settings.get('hours'),
      sorted.length ? this.closures.closedDays(sorted[0]!, sorted[sorted.length - 1]!) : Promise.resolve(new Set<DateKey>()),
    ]);
    return new Map(dates.map((d) => [d, closed.has(d) ? null : toSchedule(hours.weekly.find((w) => w.weekday === weekdayOf(d)))]));
  }

  async houseSchedule(date: DateKey): Promise<DaySchedule | null> {
    return (await this.houseSchedules([date])).get(date) ?? null;
  }

  /** Janelas de trabalho de cada profissional em cada dia: data → profissional → intervalos. */
  async windowsFor(dates: DateKey[], barberIds: string[], candidate?: Candidate): Promise<Map<DateKey, Map<string, Interval[]>>> {
    const result = new Map<DateKey, Map<string, Interval[]>>();
    if (!dates.length) return result;
    const sorted = [...dates].sort();
    const from = dayRange(sorted[0]!, this.tz).start;
    const to = dayRange(sorted[sorted.length - 1]!, this.tz).end;
    const [house, profiles, periods] = await Promise.all([
      this.houseSchedules(dates),
      this.prisma.staffProfile.findMany({ where: { userId: { in: barberIds } }, select: { userId: true, customHours: true, weeklyHours: true } }),
      this.prisma.staffSchedulePeriod.findMany({ where: { barberId: { in: barberIds }, startsAt: { lt: to }, endsAt: { gt: from } } }),
    ]);
    const hoursBy = new Map(barberIds.map((id) => [id, hoursOf(profiles.find((p) => p.userId === id))]));
    if (candidate?.hours) hoursBy.set(candidate.barberId, candidate.hours);
    const periodsOf = (id: string): PeriodRow[] => (candidate?.periods && candidate.barberId === id ? candidate.periods : periods.filter((p) => p.barberId === id));

    for (const date of dates) {
      const { start, end } = dayRange(date, this.tz);
      const dayLen = Math.round((end.getTime() - start.getTime()) / 60_000);
      const byBarber = new Map<string, Interval[]>();
      for (const id of barberIds) {
        const day: DayPeriod[] = periodsOf(id)
          .filter((p) => p.startsAt < end && p.endsAt > start)
          .map((p) => ({
            kind: p.kind as PeriodKind,
            start: Math.max(0, Math.round((p.startsAt.getTime() - start.getTime()) / 60_000)),
            end: Math.min(dayLen, Math.round((p.endsAt.getTime() - start.getTime()) / 60_000)),
          }));
        byBarber.set(id, workWindows(house.get(date) ?? null, weekdayOf(date), hoursBy.get(id)!, day));
      }
      result.set(date, byBarber);
    }
    return result;
  }

  async windowsOn(date: DateKey, barberIds: string[]): Promise<Map<string, Interval[]>> {
    return (await this.windowsFor([date], barberIds)).get(date) ?? new Map();
  }

  // ── Configuração (balcão e administrador) ────────────────────────────────

  private periodView(p: PeriodRow) {
    return {
      id: p.id,
      kind: p.kind as PeriodKind,
      startsAt: p.startsAt.toISOString(),
      endsAt: p.endsAt.toISOString(),
      startDate: toDateKey(p.startsAt, this.tz),
      startTime: formatHm(minutesOfDay(p.startsAt, this.tz)),
      endDate: toDateKey(p.endsAt, this.tz),
      endTime: formatHm(minutesOfDay(p.endsAt, this.tz)),
      reason: p.reason,
    };
  }

  private async barbers(barberId?: string) {
    return this.prisma.user.findMany({
      where: { active: true, roles: { contains: 'BARBER' }, id: barberId },
      include: { staffProfile: { select: { customHours: true, weeklyHours: true, headline: true } } },
      orderBy: { firstName: 'asc' },
    });
  }

  /** Todos os profissionais ativos com a semana e os períodos que ainda não acabaram. */
  async overview(barberId?: string) {
    const now = this.clock.now();
    const [barbers, hours] = await Promise.all([this.barbers(barberId), this.settings.get('hours')]);
    const periods = await this.prisma.staffSchedulePeriod.findMany({
      where: { barberId: { in: barbers.map((b) => b.id) }, endsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
    });
    return {
      house: hours.weekly,
      barbers: barbers.map((b) => {
        const h = hoursOf(b.staffProfile);
        return {
          id: b.id,
          name: fullName(b),
          firstName: b.firstName,
          headline: b.staffProfile?.headline ?? '',
          avatar: avatarFor(b),
          custom: h.custom,
          weekly: h.weekly,
          periods: periods.filter((p) => p.barberId === b.id).map((p) => this.periodView(p)),
        };
      }),
    };
  }

  private async requireBarber(barberId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: barberId } });
    if (!user || !parseRoles(user.roles).includes('BARBER')) throw DomainError.notFound('Profissional');
    return user;
  }

  /**
   * Atendimentos já marcados que ficariam fora da agenda com a configuração
   * candidata. Se houver algum, nada é salvo: o balcão remarca ou cancela antes.
   */
  private async assertNoConflicts(candidate: Candidate, firstName: string, action: string) {
    const appointments = await this.occupancy.upcomingAppointments(candidate.barberId, this.clock.now());
    if (!appointments.length) return;
    const dates = [...new Set(appointments.map((a) => toDateKey(a.start, this.tz)))];
    const windows = await this.windowsFor(dates, [candidate.barberId], candidate);
    const outside = appointments.filter((a) => {
      const date = toDateKey(a.start, this.tz);
      const start = minutesOfDay(a.start, this.tz);
      const duration = Math.round((a.end.getTime() - a.start.getTime()) / 60_000);
      return !fitsWindows(windows.get(date)?.get(candidate.barberId) ?? [], start, duration);
    });
    if (!outside.length) return;
    const n = outside.length;
    throw new DomainError(
      'schedule_conflict',
      `${firstName} tem ${n} atendimento${n > 1 ? 's' : ''} marcado${n > 1 ? 's' : ''} fora da nova agenda. Remarque ou cancele antes de ${action}.`,
      'conflict',
      {
        orders: outside.map((a) => ({
          code: a.code,
          customerName: a.customerName,
          date: toDateKey(a.start, this.tz),
          start: formatHm(minutesOfDay(a.start, this.tz)),
          end: formatHm(minutesOfDay(a.end, this.tz)),
        })),
      },
    );
  }

  async updateHours(barberId: string, input: z.infer<typeof staffHoursInput>) {
    const user = await this.requireBarber(barberId);
    const weekly = emptyWeek().map((d) => input.weekly.find((w) => w.weekday === d.weekday) ?? d);
    const hours: StaffHours = { custom: input.custom, weekly };
    await this.assertNoConflicts({ barberId, hours }, user.firstName, 'mudar o horário');
    const data = { customHours: hours.custom, weeklyHours: toJson(hours.weekly) };
    await this.prisma.staffProfile.upsert({ where: { userId: barberId }, create: { userId: barberId, ...data }, update: data });
    return (await this.overview(barberId)).barbers[0];
  }

  /** "2026-10-15T14:00" (hora local da casa) → instantes UTC, já validados. */
  private periodRange(input: { startsAt: string; endsAt: string }) {
    const at = (v: string) => zonedTime(v.slice(0, 10), parseHm(v.slice(11)), this.tz);
    const startsAt = at(input.startsAt);
    const endsAt = at(input.endsAt);
    invariant(startsAt < endsAt, 'invalid_range', 'O fim precisa ser depois do início.');
    invariant(endsAt > this.clock.now(), 'period_past', 'Esse período já terminou.');
    return { startsAt, endsAt };
  }

  async addPeriod(barberId: string, input: z.infer<typeof staffPeriodInput>, actor: Actor) {
    const user = await this.requireBarber(barberId);
    const { startsAt, endsAt } = this.periodRange(input);
    if (input.kind === 'CLOSED') {
      const current = await this.prisma.staffSchedulePeriod.findMany({ where: { barberId } });
      const draft: PeriodRow = { id: 'new', barberId, kind: 'CLOSED', startsAt, endsAt, reason: input.reason };
      await this.assertNoConflicts({ barberId, periods: [...current, draft] }, user.firstName, 'fechar a agenda');
    }
    const row = await this.prisma.staffSchedulePeriod.create({
      data: { barberId, kind: input.kind, startsAt, endsAt, reason: input.reason, createdById: actor.id },
    });
    return this.periodView(row);
  }

  /**
   * Ajusta datas, horas e motivo de um período (ex.: a folga das 13:00–20:00
   * vira 13:00–18:00). O tipo não muda: para trocar, remova e crie outro.
   * Fechamento que cresce ou turno extra que encolhe passam pela checagem de conflito.
   */
  async updatePeriod(id: string, input: z.infer<typeof staffPeriodUpdateInput>) {
    const period = await this.prisma.staffSchedulePeriod.findUnique({ where: { id }, include: { barber: true } });
    if (!period) throw DomainError.notFound('Período');
    const { startsAt, endsAt } = this.periodRange(input);
    const others = await this.prisma.staffSchedulePeriod.findMany({ where: { barberId: period.barberId, id: { not: id } } });
    const draft: PeriodRow = { ...period, startsAt, endsAt, reason: input.reason };
    await this.assertNoConflicts({ barberId: period.barberId, periods: [...others, draft] }, period.barber.firstName, 'mudar esse período');
    const row = await this.prisma.staffSchedulePeriod.update({ where: { id }, data: { startsAt, endsAt, reason: input.reason } });
    return this.periodView(row);
  }

  async removePeriod(id: string) {
    const period = await this.prisma.staffSchedulePeriod.findUnique({ where: { id }, include: { barber: true } });
    if (!period) throw DomainError.notFound('Período');
    // Tirar um período aberto encolhe a agenda: os atendimentos nele precisam sair antes.
    if (period.kind === 'OPEN') {
      const rest = await this.prisma.staffSchedulePeriod.findMany({ where: { barberId: period.barberId, id: { not: id } } });
      await this.assertNoConflicts({ barberId: period.barberId, periods: rest }, period.barber.firstName, 'remover esse período');
    }
    await this.prisma.staffSchedulePeriod.delete({ where: { id } });
  }
}
