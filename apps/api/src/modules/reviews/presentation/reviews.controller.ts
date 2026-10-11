import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Actor, CurrentUser, Public, Roles } from '@/shared/presentation/auth';
import { ZodPipe } from '@/shared/presentation/zod';
import { adminReviewsQuery, reviewInput, ReviewsService } from '../application/reviews.service';

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('reviews/barbers/:id')
  barber(@Param('id') id: string, @Query('page') page = '1') {
    return this.reviews.publicForBarber(id, Math.max(1, Number(page) || 1));
  }

  @Public()
  @Get('reviews/home')
  home() {
    return this.reviews.homeCarousel();
  }

  @Get('me/orders/:code/review')
  prepare(@CurrentUser() actor: Actor, @Param('code') code: string) {
    return this.reviews.prepare(actor, code);
  }

  @Post('me/orders/:code/review')
  create(@CurrentUser() actor: Actor, @Param('code') code: string, @Body(new ZodPipe(reviewInput)) body: z.infer<typeof reviewInput>) {
    return this.reviews.create(actor, code, body);
  }

  @Roles('BARBER')
  @Get('staff/reviews')
  mine(@CurrentUser() actor: Actor, @Query('filter') filter: 'all' | 'five' | 'below4' | 'text' = 'all', @Query('page') page = '1') {
    return this.reviews.forBarber(actor.id, ['all', 'five', 'below4', 'text'].includes(filter) ? filter : 'all', Math.max(1, Number(page) || 1), 10);
  }

  @Roles('RECEPTIONIST')
  @Get('admin/reviews')
  admin(@Query(new ZodPipe(adminReviewsQuery)) q: z.infer<typeof adminReviewsQuery>) {
    return this.reviews.adminList(q);
  }

  @Roles('RECEPTIONIST')
  @Patch('admin/reviews/:id/home')
  home2(@Param('id') id: string, @Body(new ZodPipe(z.object({ show: z.boolean() }))) body: { show: boolean }) {
    return this.reviews.setShowOnHome(id, body.show);
  }

  @Roles('RECEPTIONIST')
  @Post('admin/reviews/:id/reply')
  reply(@CurrentUser() actor: Actor, @Param('id') id: string, @Body(new ZodPipe(z.object({ text: z.string() }))) body: { text: string }) {
    return this.reviews.reply(actor, id, body.text);
  }
}
