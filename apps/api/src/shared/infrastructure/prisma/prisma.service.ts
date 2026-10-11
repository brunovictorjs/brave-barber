import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppConfig } from '@/config/app-config.service';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly config: AppConfig) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    if (this.config.databaseProvider === 'sqlite') {
      // WAL deixa leituras e escritas simultâneas mais tranquilas no SQLite.
      await this.$queryRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => undefined);
    }
    this.logger.log(`Banco conectado (${this.config.databaseProvider})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Filtro de texto que ignora maiúsculas nos dois bancos. No Postgres o
   * Prisma precisa de `mode: 'insensitive'`; no SQLite o LIKE já ignora caixa
   * (para ASCII) e a opção nem existe.
   */
  contains(value: string): Prisma.StringFilter {
    return this.config.databaseProvider === 'postgresql'
      ? ({ contains: value, mode: 'insensitive' } as Prisma.StringFilter)
      : { contains: value };
  }
}
