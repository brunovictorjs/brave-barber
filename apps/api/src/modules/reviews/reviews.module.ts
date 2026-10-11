import { Module } from '@nestjs/common';
import { ReviewsService } from './application/reviews.service';
import { ReviewsController } from './presentation/reviews.controller';

/** Avaliações: do cliente, vitrine da home, respostas da casa. */
@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
