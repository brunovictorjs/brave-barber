import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '@/shared/presentation/auth';
import { ZodPipe } from '@/shared/presentation/zod';
import { AvailabilityService } from '../application/availability.service';

const ids = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const calendarQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), services: ids });
const slotsQuery = z.object({ date, services: ids });
const barbersQuery = z.object({ date, time: z.string().regex(/^\d{2}:\d{2}$/), services: ids });

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Public()
  @Get('calendar')
  calendar(@Query(new ZodPipe(calendarQuery)) q: z.infer<typeof calendarQuery>) {
    return this.availability.calendar(q.month, q.services);
  }

  @Public()
  @Get('slots')
  slots(@Query(new ZodPipe(slotsQuery)) q: z.infer<typeof slotsQuery>) {
    return this.availability.slots(q.date, q.services);
  }

  @Public()
  @Get('barbers')
  barbers(@Query(new ZodPipe(barbersQuery)) q: z.infer<typeof barbersQuery>) {
    return this.availability.barbersAt(q.date, q.time, q.services);
  }

  @Public()
  @Get('next')
  next() {
    return this.availability.nextFreeSlot();
  }
}
