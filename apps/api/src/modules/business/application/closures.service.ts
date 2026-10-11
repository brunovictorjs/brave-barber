import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppConfig } from '@/config/app-config.service';
import { addDays, DateKey, toDateKey, zonedTime } from '@/shared/domain/business-time';
import { DomainError, invariant } from '@/shared/domain/domain-error';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';

export const closureInput = z.object({
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().min(2, 'Diga o motivo do fechamento'),
});

export interface ClosureView {
  id: string;
  startsOn: DateKey;
  endsOn: DateKey;
  reason: string;
}

/** Fechamentos previstos (feriados, recesso): a agenda não oferece esses dias. */
@Injectable()
export class ClosuresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async list(): Promise<ClosureView[]> {
    const rows = await this.prisma.closure.findMany({ orderBy: { startsOn: 'asc' } });
    return rows.map((r) => ({
      id: r.id,
      startsOn: toDateKey(r.startsOn, this.config.timeZone),
      endsOn: toDateKey(r.endsOn, this.config.timeZone),
      reason: r.reason,
    }));
  }

  async create(input: z.infer<typeof closureInput>): Promise<ClosureView> {
    invariant(input.startsOn <= input.endsOn, 'invalid_range', 'A data final precisa ser igual ou depois da inicial.');
    const tz = this.config.timeZone;
    const row = await this.prisma.closure.create({
      data: { startsOn: zonedTime(input.startsOn, 0, tz), endsOn: zonedTime(input.endsOn, 0, tz), reason: input.reason },
    });
    return { id: row.id, startsOn: input.startsOn, endsOn: input.endsOn, reason: row.reason };
  }

  async remove(id: string): Promise<void> {
    const found = await this.prisma.closure.findUnique({ where: { id } });
    if (!found) throw DomainError.notFound('Fechamento');
    await this.prisma.closure.delete({ where: { id } });
  }

  /** Conjunto de dias fechados entre duas datas (inclusive). */
  async closedDays(from: DateKey, to: DateKey): Promise<Set<DateKey>> {
    const closures = await this.list();
    const days = new Set<DateKey>();
    for (const c of closures) {
      if (c.endsOn < from || c.startsOn > to) continue;
      for (let d = c.startsOn; d <= c.endsOn; d = addDays(d, 1)) days.add(d);
    }
    return days;
  }
}
