import { Module } from '@nestjs/common';
import { BusinessModule } from '@/modules/business/business.module';
import { CatalogModule } from '@/modules/catalog/catalog.module';
import { FavoritesService } from './application/favorites.service';
import { LogMailer, Mailer } from './application/mailer';
import { NotificationsService } from './application/notifications.service';
import { AdminNotificationsController, EngagementController } from './presentation/engagement.controller';

/** Engajamento: favoritos, avisos no app e e-mails. */
@Module({
  imports: [BusinessModule, CatalogModule],
  controllers: [EngagementController, AdminNotificationsController],
  providers: [FavoritesService, NotificationsService, { provide: Mailer, useClass: LogMailer }],
  exports: [FavoritesService],
})
export class EngagementModule {}
