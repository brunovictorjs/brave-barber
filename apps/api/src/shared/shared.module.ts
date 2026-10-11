import { Global, Module } from '@nestjs/common';
import { AppConfig } from '@/config/app-config.service';
import { Clock, SystemClock } from './infrastructure/clock';
import { EventBus } from './infrastructure/event-bus';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { FileStorage, fileStorageProvider } from './infrastructure/storage/storage';

/** Núcleo compartilhado: banco, relógio, configuração, arquivos e barramento de eventos. */
@Global()
@Module({
  providers: [AppConfig, PrismaService, EventBus, fileStorageProvider, { provide: Clock, useClass: SystemClock }],
  exports: [AppConfig, PrismaService, EventBus, Clock, FileStorage],
})
export class SharedModule {}
