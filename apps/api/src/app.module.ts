import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';
import { AppConfig } from './config/app-config.service';
import { validateEnv } from './config/env';
import { BusinessModule } from './modules/business/business.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CommissionsModule } from './modules/commissions/commissions.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { IdentityModule } from './modules/identity/identity.module';
import { OrderingModule } from './modules/ordering/ordering.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { StorefrontModule } from './modules/storefront/storefront.module';
import { AuthGuard } from './shared/presentation/auth';
import { DomainExceptionFilter } from './shared/presentation/domain-exception.filter';
import { HealthController } from './shared/presentation/health.controller';
import { SharedModule } from './shared/shared.module';

/**
 * Monólito modular. Cada módulo é um contexto delimitado com suas camadas
 * (domínio → aplicação → infraestrutura/apresentação) e conversa com os outros
 * por serviços exportados ou por eventos de domínio.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    EventEmitterModule.forRoot({ wildcard: false }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({ rootPath: join(process.cwd(), 'uploads'), serveRoot: '/uploads', serveStaticOptions: { index: false, maxAge: '7d' } }),
    JwtModule.registerAsync({
      global: true,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN') as `${number}d` },
      }),
      extraProviders: [AppConfig],
    }),
    SharedModule,
    BusinessModule,
    IdentityModule,
    CatalogModule,
    SchedulingModule,
    CommissionsModule,
    OrderingModule,
    ReviewsModule,
    EngagementModule,
    StorefrontModule,
    ReportingModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
