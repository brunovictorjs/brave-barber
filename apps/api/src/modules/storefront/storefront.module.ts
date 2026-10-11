import { Controller, Get, Module, Param } from '@nestjs/common';
import { Actor, CurrentUser, Public } from '@/shared/presentation/auth';
import { BusinessModule } from '@/modules/business/business.module';
import { CatalogModule } from '@/modules/catalog/catalog.module';
import { EngagementModule } from '@/modules/engagement/engagement.module';
import { ReviewsModule } from '@/modules/reviews/reviews.module';
import { SchedulingModule } from '@/modules/scheduling/scheduling.module';
import { StorefrontService } from './storefront.service';

@Controller('storefront')
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Public()
  @Get('home')
  home(@CurrentUser() actor?: Actor) {
    return this.storefront.home(actor?.id);
  }

  @Public()
  @Get('barbers/:id')
  barber(@Param('id') id: string, @CurrentUser() actor?: Actor) {
    return this.storefront.barber(id, actor?.id);
  }
}

/** Vitrine pública: compõe catálogo, agenda, avaliações e dados da casa. */
@Module({
  imports: [BusinessModule, CatalogModule, ReviewsModule, SchedulingModule, EngagementModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
