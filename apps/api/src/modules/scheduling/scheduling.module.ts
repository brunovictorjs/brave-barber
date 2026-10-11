import { Module } from '@nestjs/common';
import { BusinessModule } from '@/modules/business/business.module';
import { AvailabilityService } from './application/availability.service';
import { OccupancyReader } from './domain/occupancy';
import { PrismaOccupancyReader } from './infrastructure/prisma-occupancy.reader';
import { AvailabilityController } from './presentation/availability.controller';

/** Agenda: horários livres, escolha de profissional e encaixes. */
@Module({
  imports: [BusinessModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityService, { provide: OccupancyReader, useClass: PrismaOccupancyReader }],
  exports: [AvailabilityService],
})
export class SchedulingModule {}
