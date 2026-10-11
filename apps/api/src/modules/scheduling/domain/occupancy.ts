import type { Interval } from './availability';

export interface BarberSummary {
  id: string;
  name: string;
  firstName: string;
  headline: string;
  avatarUrl: string | null;
}

/**
 * Porta de leitura: o que já ocupa a agenda dos profissionais. A agenda não
 * conhece pedidos — só intervalos ocupados (em instantes UTC).
 */
export abstract class OccupancyReader {
  /** Intervalos ocupados por profissional entre dois instantes. */
  abstract busyBetween(from: Date, to: Date, opts?: { ignoreOrderId?: string }): Promise<Map<string, { start: Date; end: Date }[]>>;
  /** Profissionais ativos e aptos a executar TODOS os serviços informados. */
  abstract eligibleBarbers(serviceIds: string[]): Promise<BarberSummary[]>;
  abstract activeBarbers(): Promise<BarberSummary[]>;
  /** Soma das durações dos serviços (minutos). */
  abstract totalDuration(serviceIds: string[]): Promise<number>;
  /** Menor duração entre os serviços ativos (para "próximo horário livre"). */
  abstract shortestServiceDuration(): Promise<number>;
  abstract ratings(barberIds: string[]): Promise<Map<string, { average: number | null; count: number }>>;
}

export function toMinuteIntervals(
  list: { start: Date; end: Date }[] | undefined,
  dayStart: Date,
): Interval[] {
  return (list ?? []).map((b) => ({
    start: Math.round((b.start.getTime() - dayStart.getTime()) / 60_000),
    end: Math.round((b.end.getTime() - dayStart.getTime()) / 60_000),
  }));
}
