import { Controller, Get } from '@nestjs/common';
import { AppConfig } from '@/config/app-config.service';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { Public } from './auth';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRawUnsafe('SELECT 1');
    return {
      ok: true,
      database: this.config.databaseProvider,
      payments: this.config.get('STRIPE_SECRET_KEY') ? 'stripe' : 'simulado',
      storage: this.config.get('STORAGE_DRIVER'),
    };
  }
}
