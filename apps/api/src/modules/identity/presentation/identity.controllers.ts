import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { AppConfig } from '@/config/app-config.service';
import { DomainError } from '@/shared/domain/domain-error';
import { Actor, CurrentUser, Public, Roles, SESSION_COOKIE } from '@/shared/presentation/auth';
import { ZodPipe } from '@/shared/presentation/zod';
import type { UploadedFile as StoredFile } from '@/shared/infrastructure/storage/storage';
import { LegalService } from '@/modules/business/application/legal.service';
import { AuthService } from '../application/auth.service';
import { aboutInput, identityInput, ProfileService } from '../application/profile.service';
import { inviteInput, updateUserInput, USER_TABS, UserTab, UsersAdminService } from '../application/users-admin.service';

const SEVEN_DAYS = 7 * 24 * 3600 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  private setCookie(res: Response, token: string) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.isProduction,
      maxAge: SEVEN_DAYS,
      path: '/',
    });
  }

  @Public()
  @Get('providers')
  providers() {
    return this.auth.providers;
  }

  @Public()
  @Get('dev-users')
  devUsers() {
    return this.auth.devUsers();
  }

  @Public()
  @Post('google')
  @HttpCode(200)
  async google(@Body(new ZodPipe(z.object({ credential: z.string().min(10) }))) body: { credential: string }, @Res({ passthrough: true }) res: Response) {
    const { token, isNew } = await this.auth.loginWithGoogle(body.credential);
    this.setCookie(res, token);
    return { ok: true, isNew };
  }

  @Public()
  @Post('dev')
  @HttpCode(200)
  async dev(@Body(new ZodPipe(z.object({ userId: z.string() }))) body: { userId: string }, @Res({ passthrough: true }) res: Response) {
    const { token } = await this.auth.devLogin(body.userId);
    this.setCookie(res, token);
    return { ok: true };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  /** Sessão atual ou null (visitante), sem erro 401 no console. */
  @Public()
  @Get('session')
  session(@CurrentUser() actor?: Actor) {
    return actor ? this.auth.me(actor.id).catch(() => null) : null;
  }

  @Get('me')
  me(@CurrentUser() actor: Actor) {
    return this.auth.me(actor.id);
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@CurrentUser() actor: Actor, @Res({ passthrough: true }) res: Response) {
    this.setCookie(res, await this.auth.refresh(actor.id));
    return { ok: true };
  }
}

@Controller('me')
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly legal: LegalService,
    private readonly auth: AuthService,
  ) {}

  @Put('identity')
  async identity(@CurrentUser() actor: Actor, @Body(new ZodPipe(identityInput)) body: z.infer<typeof identityInput>) {
    await this.profile.updateIdentity(actor.id, body);
    return this.auth.me(actor.id);
  }

  @Put('about')
  async about(@CurrentUser() actor: Actor, @Body(new ZodPipe(aboutInput)) body: z.infer<typeof aboutInput>) {
    await this.profile.updateAbout(actor.id, body);
    return this.auth.me(actor.id);
  }

  @Post('onboarding/finish')
  async finish(@CurrentUser() actor: Actor) {
    await this.profile.finishOnboarding(actor.id);
    return this.auth.me(actor.id);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  avatar(@CurrentUser() actor: Actor, @UploadedFile() file?: StoredFile) {
    if (!file) throw new DomainError('no_file', 'Escolha uma foto.');
    return this.profile.uploadAvatar(actor.id, file);
  }

  @Post('legal/accept')
  async acceptLegal(@CurrentUser() actor: Actor) {
    await this.legal.accept(actor.id);
    return { ok: true };
  }
}

const listQuery = z.object({
  q: z.string().optional(),
  active: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

@Controller('admin/users')
@Roles('ADMIN')
export class UsersAdminController {
  constructor(private readonly users: UsersAdminService) {}

  @Get(':tab')
  list(@Param('tab') tab: string, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    if (!(USER_TABS as readonly string[]).includes(tab)) throw DomainError.notFound('Aba');
    return this.users.list(tab as UserTab, q);
  }

  @Post()
  invite(@CurrentUser() actor: Actor, @Body(new ZodPipe(inviteInput)) body: z.infer<typeof inviteInput>) {
    return this.users.invite(actor, body);
  }

  @Patch(':id')
  update(@CurrentUser() actor: Actor, @Param('id') id: string, @Body(new ZodPipe(updateUserInput)) body: z.infer<typeof updateUserInput>) {
    return this.users.update(actor, id, body);
  }
}
