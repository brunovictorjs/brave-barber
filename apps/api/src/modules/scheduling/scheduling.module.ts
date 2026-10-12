import { Module } from '@nestjs/common';
import { BusinessModule } from '@/modules/business/business.module';
import { AvailabilityService } from './application/availability.service';
import { StaffSchedulesService } from './application/staff-schedules.service';
import { OccupancyReader } from './domain/occupancy';
import { PrismaOccupancyReader } from './infrastructure/prisma-occupancy.reader';
import { AvailabilityController } from './presentation/availability.controller';
import { MyScheduleController, StaffSchedulesController } from './presentation/staff-schedules.controller';

/** Agenda: horários livres, escolha de profissional, encaixes e a agenda de cada profissional. */
@Module({
  imports: [BusinessModule],
  controllers: [AvailabilityController, StaffSchedulesController, MyScheduleController],
  providers: [AvailabilityService, StaffSchedulesService, { provide: OccupancyReader, useClass: PrismaOccupancyReader }],
  exports: [AvailabilityService, StaffSchedulesService],
})
export class SchedulingModule {}
