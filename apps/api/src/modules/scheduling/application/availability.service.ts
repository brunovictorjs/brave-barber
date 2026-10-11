import { Injectable } from '@nestjs/common';
import { AppConfig } from '@/config/app-config.service';
import {
  addDays,
  DateKey,
  dayRange,
  formatHm,
  minutesOfDay,
  parseDateKey,
  parseHm,
  toDateKey,
  weekdayOf,
  zonedTime,
} from '@/shared/domain/business-time';
import { DomainError } from '@/shared/domain/domain-error';
import { Clock } from '@/shared/infrastructure/clock';
import { avatarFor } from '@/shared/domain/avatar';
import { ClosuresService } from '@/modules/business/application/closures.service';
import { SettingsService } from '@/modules/business/application/settings.service';
import type { WeekdayHours } from '@/modules/business/domain/settings';
import { computeSlots, DaySchedule, isBarberFree, Interval, nextGap, pickLeastBusy } from '../domain/availability';
import { OccupancyReader, toMinuteIntervals } from '../domain/occupancy';

export type DayStatus = 'available' | 'full' | 'closed' | 'past' | 'beyond';

export interface BookingRequest {
  date: DateKey;
  time: string; // "14:40"
  serviceIds: string[];
  durationMin?: number;
  barberId: string | null;
  ignoreOrderId?: string;
}

function toSchedule(h: WeekdayHours | undefined): DaySchedule | null {
  if (!h?.open || !h.close) return null;
  return {
    open: parseHm(h.open),
    close: parseHm(h.close),
    breakStart: h.breakStart ? parseHm(h.breakStart) : null,
    breakEnd: h.breakEnd ? parseHm(h.breakEnd) : null,
  };
}

/** Agenda da casa: dias com vaga, horários livres e quem pode atender. */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly occupancy: OccupancyReader,
    private readonly settings: SettingsService,
    private readonly closures: ClosuresService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  private get tz(): string {
    return this.config.timeZone;
  }

  today(): DateKey {
    return toDateKey(this.clock.now(), this.tz);
  }

  async scheduleFor(date: DateKey): Promise<DaySchedule | null> {
    const [hours, closed] = await Promise.all([this.settings.get('hours'), this.closures.closedDays(date, date)]);
    if (closed.has(date)) return null;
    return toSchedule(hours.weekly.find((w) => w.weekday === weekdayOf(date)));
  }

  private async busyOn(date: DateKey, ignoreOrderId?: string): Promise<{ map: Map<string, Interval[]>; dayStart: Date }> {
    const { start, end } = dayRange(date, this.tz);
    const raw = await this.occupancy.busyBetween(start, end, { ignoreOrderId });
    const map = new Map<string, Interval[]>();
    for (const [barberId, list] of raw) map.set(barberId, toMinuteIntervals(list, start));
    return { map, dayStart: start };
  }

  private async earliestFor(date: DateKey): Promise<number | null> {
    const today = this.today();
    if (date !== today) return null;
    const rules = await this.settings.get('scheduling');
    return minutesOfDay(this.clock.now(), this.tz) + rules.minAdvanceMin;
  }

  private async duration(serviceIds: string[], given?: number): Promise<number> {
    const minutes = given ?? (await this.occupancy.totalDuration(serviceIds));
    if (minutes <= 0) throw new DomainError('no_services', 'Escolha ao menos um serviço para ver os horários.');
    return minutes;
  }

  async calendar(month: string, serviceIds: string[]) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) throw new DomainError('invalid_month', 'Mês inválido.');
    const durationMin = await this.duration(serviceIds);
    const [rules, hours, barbers] = await Promise.all([
      this.settings.get('scheduling'),
      this.settings.get('hours'),
      this.occupancy.eligibleBarbers(serviceIds),
    ]);
    const first: DateKey = `${month}-01`;
    const { year, month: m } = parseDateKey(first);
    const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
    const last: DateKey = `${month}-${String(lastDay).padStart(2, '0')}`;
    const today = this.today();
    const horizon = addDays(today, rules.horizonDays);
    const closed = await this.closures.closedDays(first, last);

    const { start } = dayRange(first, this.tz);
    const { end } = dayRange(last, this.tz);
    const raw = await this.occupancy.busyBetween(start, end);
    const nowMin = minutesOfDay(this.clock.now(), this.tz);

    const days: { date: DateKey; weekday: number; status: DayStatus }[] = [];
    for (let day = 1; day <= lastDay; day++) {
      const date: DateKey = `${month}-${String(day).padStart(2, '0')}`;
      const weekday = weekdayOf(date);
      const schedule = closed.has(date) ? null : toSchedule(hours.weekly.find((w) => w.weekday === weekday));
      let status: DayStatus;
      if (date < today) status = 'past';
      else if (!schedule) status = 'closed';
      else if (date > horizon) status = 'beyond';
      else {
        const dayStart = dayRange(date, this.tz).start;
        const busy = new Map<string, Interval[]>();
        for (const [id, list] of raw) busy.set(id, toMinuteIntervals(list, dayStart));
        const slots = computeSlots({
          schedule,
          durationMin,
          stepMin: rules.slotIntervalMin,
          bufferMin: rules.bufferMin,
          earliestStartMin: date === today ? nowMin + rules.minAdvanceMin : null,
          barberIds: barbers.map((b) => b.id),
          busy,
        });
        status = slots.some((s) => s.freeBarberIds.length) ? 'available' : 'full';
      }
      days.push({ date, weekday, status });
    }
    return { month, durationMin, today, days };
  }

  async slots(date: DateKey, serviceIds: string[]) {
    const durationMin = await this.duration(serviceIds);
    const [schedule, rules, barbers, busy, earliest] = await Promise.all([
      this.scheduleFor(date),
      this.settings.get('scheduling'),
      this.occupancy.eligibleBarbers(serviceIds),
      this.busyOn(date),
      this.earliestFor(date),
    ]);
    if (date < this.today()) return { date, durationMin, slots: [] };
    const slots = computeSlots({
      schedule,
      durationMin,
      stepMin: rules.slotIntervalMin,
      bufferMin: rules.bufferMin,
      earliestStartMin: earliest,
      barberIds: barbers.map((b) => b.id),
      busy: busy.map,
    });
    return {
      date,
      durationMin,
      slots: slots.map((s) => ({
        time: formatHm(s.minutes),
        endTime: formatHm(s.minutes + durationMin),
        available: s.freeBarberIds.length > 0,
        freeCount: s.freeBarberIds.length,
      })),
    };
  }

  async barbersAt(date: DateKey, time: string, serviceIds: string[]) {
    const durationMin = await this.duration(serviceIds);
    const start = parseHm(time);
    const [rules, barbers, busy] = await Promise.all([
      this.settings.get('scheduling'),
      this.occupancy.eligibleBarbers(serviceIds),
      this.busyOn(date),
    ]);
    const ratings = await this.occupancy.ratings(barbers.map((b) => b.id));
    const list = barbers.map((b) => {
      const free = isBarberFree(busy.map.get(b.id), start, durationMin, rules.bufferMin);
      const blocking = (busy.map.get(b.id) ?? []).filter((i) => i.start < start + durationMin + rules.bufferMin && i.end + rules.bufferMin > start);
      const busyUntil = blocking.length ? formatHm(Math.max(...blocking.map((i) => i.end))) : null;
      return {
        id: b.id,
        name: b.name,
        headline: b.headline,
        avatar: avatarFor({ id: b.id, name: b.name, avatarUrl: b.avatarUrl }),
        rating: ratings.get(b.id) ?? { average: null, count: 0 },
        free,
        busyUntil,
      };
    });
    return { date, time, durationMin, freeCount: list.filter((b) => b.free).length, barbers: list };
  }

  /**
   * Confirma que o horário ainda está livre e define o profissional (quando o
   * cliente escolheu "qualquer profissional"). Lança erro se a vaga acabou.
   */
  async resolveBooking(req: BookingRequest): Promise<{ start: Date; end: Date; barberId: string }> {
    const durationMin = await this.duration(req.serviceIds, req.durationMin);
    const startMin = parseHm(req.time);
    const today = this.today();
    if (req.date < today) throw new DomainError('slot_past', 'Esse dia já passou. Escolha outra data.');
    const [schedule, rules, barbers, busy, earliest] = await Promise.all([
      this.scheduleFor(req.date),
      this.settings.get('scheduling'),
      this.occupancy.eligibleBarbers(req.serviceIds),
      this.busyOn(req.date, req.ignoreOrderId),
      this.earliestFor(req.date),
    ]);
    if (req.date > addDays(today, rules.horizonDays)) {
      throw new DomainError('slot_beyond', `Dá para agendar com até ${rules.horizonDays} dias de antecedência.`);
    }
    const slot = computeSlots({
      schedule,
      durationMin,
      stepMin: 1, // aceita qualquer minuto dentro do turno; a grade é só sugestão da tela
      bufferMin: rules.bufferMin,
      earliestStartMin: earliest,
      barberIds: barbers.map((b) => b.id),
      busy: busy.map,
    }).find((s) => s.minutes === startMin);
    if (!slot) throw DomainError.conflict('slot_unavailable', 'Esse horário não está mais disponível. Escolha outro.');

    let barberId = req.barberId;
    if (barberId) {
      if (!barbers.some((b) => b.id === barberId)) {
        throw new DomainError('barber_not_eligible', 'Esse profissional não faz todos os serviços escolhidos.');
      }
      if (!slot.freeBarberIds.includes(barberId)) {
        throw DomainError.conflict('barber_busy', 'Esse profissional ficou ocupado nesse horário. Escolha outro horário ou outra pessoa.');
      }
    } else {
      barberId = pickLeastBusy(slot.freeBarberIds, busy.map);
      if (!barberId) throw DomainError.conflict('slot_unavailable', 'Esse horário não está mais disponível. Escolha outro.');
    }
    const start = zonedTime(req.date, startMin, this.tz);
    return { start, end: new Date(start.getTime() + durationMin * 60_000), barberId };
  }

  /** "Próximo livre: Hoje, 14:20" na landing. */
  async nextFreeSlot(): Promise<{ date: DateKey; time: string } | null> {
    const [rules, barbers, durationMin] = await Promise.all([
      this.settings.get('scheduling'),
      this.occupancy.activeBarbers(),
      this.occupancy.shortestServiceDuration(),
    ]);
    const today = this.today();
    for (let i = 0; i < 14; i++) {
      const date = addDays(today, i);
      const [schedule, busy, earliest] = await Promise.all([this.scheduleFor(date), this.busyOn(date), this.earliestFor(date)]);
      const slot = computeSlots({
        schedule,
        durationMin,
        stepMin: rules.slotIntervalMin,
        bufferMin: rules.bufferMin,
        earliestStartMin: earliest,
        barberIds: barbers.map((b) => b.id),
        busy: busy.map,
      }).find((s) => s.freeBarberIds.length);
      if (slot) return { date, time: formatHm(slot.minutes) };
    }
    return null;
  }

  /** Para o balcão: quando cada profissional fica livre hoje para um atendimento de X minutos. */
  async freeTimesToday(durationMin: number) {
    const date = this.today();
    const [schedule, rules, barbers, busy] = await Promise.all([
      this.scheduleFor(date),
      this.settings.get('scheduling'),
      this.occupancy.activeBarbers(),
      this.busyOn(date),
    ]);
    const nowMin = minutesOfDay(this.clock.now(), this.tz);
    return barbers.map((b) => {
      const at = nextGap(schedule, busy.map.get(b.id) ?? [], nowMin, Math.max(durationMin, 5), rules.bufferMin);
      return {
        id: b.id,
        name: b.name,
        firstName: b.firstName,
        avatar: avatarFor({ id: b.id, name: b.name, avatarUrl: b.avatarUrl }),
        nextFree: at === null ? null : formatHm(at),
        freeNow: at !== null && at <= nowMin + 5,
        startsAt: at === null ? null : zonedTime(date, at, this.tz),
      };
    });
  }

  /** Encaixe de atrasado: próxima folga do profissional a partir de agora. */
  async fitIn(barberId: string, durationMin: number, ignoreOrderId: string): Promise<Date | null> {
    const date = this.today();
    const [schedule, rules, busy] = await Promise.all([this.scheduleFor(date), this.settings.get('scheduling'), this.busyOn(date, ignoreOrderId)]);
    const nowMin = minutesOfDay(this.clock.now(), this.tz);
    const at = nextGap(schedule, busy.map.get(barberId) ?? [], nowMin, durationMin, rules.bufferMin);
    return at === null ? null : zonedTime(date, at, this.tz);
  }
}
