import { Module } from '@nestjs/common';
import { ClosuresService } from './application/closures.service';
import { LegalService } from './application/legal.service';
import { SettingsService } from './application/settings.service';
import { PublicBusinessController, SettingsController } from './presentation/business.controller';

/** Negócio: dados da casa, horários, regras, políticas e configurações. */
@Module({
  controllers: [PublicBusinessController, SettingsController],
  providers: [SettingsService, ClosuresService, LegalService],
  exports: [SettingsService, ClosuresService, LegalService],
})
export class BusinessModule {}
