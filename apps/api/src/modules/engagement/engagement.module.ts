import { Module } from '@nestjs/common';
import { AppConfig } from '@/config/app-config.service';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { BusinessModule } from '@/modules/business/business.module';
import { SettingsService } from '@/modules/business/application/settings.service';
import { CatalogModule } from '@/modules/catalog/catalog.module';
import { FavoritesService } from './application/favorites.service';
import { Mailer } from './application/mailer';
import { NotificationsService } from './application/notifications.service';
import { LogMailer } from './infrastructure/log-mailer';
import { ResendMailer } from './infrastructure/resend-mailer';
import { AdminNotificationsController, EngagementController } from './presentation/engagement.controller';

/** Engajamento: favoritos, avisos no app e e-mails. */
@Module({
  imports: [BusinessModule, CatalogModule],
  controllers: [EngagementController, AdminNotificationsController],
  providers: [
    FavoritesService,
    NotificationsService,
    {
      provide: Mailer,
      inject: [AppConfig, PrismaService, SettingsService],
      useFactory: (config: AppConfig, prisma: PrismaService, settings: SettingsService): Mailer =>
        config.get('MAIL_DRIVER') === 'resend' ? new ResendMailer(prisma, config, settings) : new LogMailer(prisma),
    },
  ],
  exports: [FavoritesService],
})
export class EngagementModule {}
