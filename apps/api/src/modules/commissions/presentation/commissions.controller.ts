import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Actor, CurrentUser, Roles } from '@/shared/presentation/auth';
import { ZodPipe } from '@/shared/presentation/zod';
import { categoryRuleInput, CommissionQueries, periodInput, PeriodInput, ratesInput } from '../application/commission.queries';

const earningsQuery = periodInput.extend({
  filter: z.enum(['all', 'completed', 'cancelled']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
});

@Controller('staff/earnings')
@Roles('BARBER')
export class EarningsController {
  constructor(private readonly queries: CommissionQueries) {}

  @Get()
  earnings(@CurrentUser() actor: Actor, @Query(new ZodPipe(earningsQuery)) q: z.infer<typeof earningsQuery>) {
    return this.queries.earnings(actor.id, q, { filter: q.filter, page: q.page });
  }
}

@Controller('admin/commissions')
@Roles('ADMIN')
export class AdminCommissionsController {
  constructor(private readonly queries: CommissionQueries) {}

  @Get()
  overview(@Query(new ZodPipe(periodInput)) q: PeriodInput) {
    return this.queries.overview(q);
  }

  @Put('barbers/:id')
  async setRates(@Param('id') id: string, @Body(new ZodPipe(ratesInput)) body: z.infer<typeof ratesInput>) {
    await this.queries.setRates(id, body);
    return { ok: true };
  }

  @Put('categories')
  async upsertRule(@Body(new ZodPipe(categoryRuleInput)) body: z.infer<typeof categoryRuleInput>) {
    await this.queries.upsertCategoryRule(body);
    return { ok: true };
  }

  @Delete('categories/:categoryId')
  async removeRule(@Param('categoryId') categoryId: string) {
    await this.queries.removeCategoryRule(categoryId);
    return { ok: true };
  }
}
