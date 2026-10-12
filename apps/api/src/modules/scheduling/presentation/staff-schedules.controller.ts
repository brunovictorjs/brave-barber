import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Actor, CurrentUser, Roles } from '@/shared/presentation/auth';
import { ZodPipe } from '@/shared/presentation/zod';
import { staffHoursInput, staffPeriodInput, staffPeriodUpdateInput, StaffSchedulesService } from '../application/staff-schedules.service';

/** Agenda da equipe: o balcão e o administrador configuram; o barbeiro só consulta a dele. */
@Controller('admin/staff-schedules')
@Roles('RECEPTIONIST')
export class StaffSchedulesController {
  constructor(private readonly schedules: StaffSchedulesService) {}

  @Get()
  overview() {
    return this.schedules.overview();
  }

  @Put(':barberId/hours')
  updateHours(@Param('barberId') barberId: string, @Body(new ZodPipe(staffHoursInput)) body: z.infer<typeof staffHoursInput>) {
    return this.schedules.updateHours(barberId, body);
  }

  @Post(':barberId/periods')
  addPeriod(
    @Param('barberId') barberId: string,
    @Body(new ZodPipe(staffPeriodInput)) body: z.infer<typeof staffPeriodInput>,
    @CurrentUser() actor: Actor,
  ) {
    return this.schedules.addPeriod(barberId, body, actor);
  }

  @Put('periods/:id')
  updatePeriod(@Param('id') id: string, @Body(new ZodPipe(staffPeriodUpdateInput)) body: z.infer<typeof staffPeriodUpdateInput>) {
    return this.schedules.updatePeriod(id, body);
  }

  @Delete('periods/:id')
  async removePeriod(@Param('id') id: string) {
    await this.schedules.removePeriod(id);
    return { ok: true };
  }
}

@Controller('staff/schedule')
@Roles('BARBER')
export class MyScheduleController {
  constructor(private readonly schedules: StaffSchedulesService) {}

  @Get()
  async mine(@CurrentUser() actor: Actor) {
    const { house, barbers } = await this.schedules.overview(actor.id);
    return { house, me: barbers[0] ?? null };
  }
}
