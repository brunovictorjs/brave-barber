import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env';

/** Acesso tipado às variáveis de ambiente já validadas. */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get timeZone(): string {
    return this.get('BUSINESS_TIMEZONE');
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get databaseProvider(): Env['DATABASE_PROVIDER'] {
    return this.get('DATABASE_PROVIDER');
  }
}
