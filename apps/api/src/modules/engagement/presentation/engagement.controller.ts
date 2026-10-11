import { Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { Actor, CurrentUser, Roles } from '@/shared/presentation/auth';
import { FavoritesService } from '../application/favorites.service';
import { NotificationsService } from '../application/notifications.service';

@Controller('me')
export class EngagementController {
  constructor(
    private readonly favorites: FavoritesService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('favorites')
  listFavorites(@CurrentUser() actor: Actor) {
    return this.favorites.list(actor.id);
  }

  @Put('favorites/services/:id')
  async favService(@CurrentUser() actor: Actor, @Param('id') id: string) {
    await this.favorites.addService(actor.id, id);
    return { ok: true };
  }

  @Delete('favorites/services/:id')
  async unfavService(@CurrentUser() actor: Actor, @Param('id') id: string) {
    await this.favorites.removeService(actor.id, id);
    return { ok: true };
  }

  @Put('favorites/products/:id')
  async favProduct(@CurrentUser() actor: Actor, @Param('id') id: string) {
    await this.favorites.addProduct(actor.id, id);
    return { ok: true };
  }

  @Delete('favorites/products/:id')
  async unfavProduct(@CurrentUser() actor: Actor, @Param('id') id: string) {
    await this.favorites.removeProduct(actor.id, id);
    return { ok: true };
  }

  @Put('favorites/barbers/:id')
  async favBarber(@CurrentUser() actor: Actor, @Param('id') id: string) {
    await this.favorites.addBarber(actor.id, id);
    return { ok: true };
  }

  @Delete('favorites/barbers/:id')
  async unfavBarber(@CurrentUser() actor: Actor, @Param('id') id: string) {
    await this.favorites.removeBarber(actor.id, id);
    return { ok: true };
  }

  @Get('notifications')
  listNotifications(@CurrentUser() actor: Actor) {
    return this.notifications.list(actor.id);
  }

  @Post('notifications/read-all')
  async readAll(@CurrentUser() actor: Actor) {
    await this.notifications.markAllRead(actor.id);
    return { ok: true };
  }

  @Post('notifications/:id/read')
  async read(@CurrentUser() actor: Actor, @Param('id') id: string) {
    await this.notifications.markRead(actor.id, id);
    return { ok: true };
  }
}

@Controller('admin/notifications')
@Roles('ADMIN')
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('log')
  log() {
    return this.notifications.emailLog();
  }
}
