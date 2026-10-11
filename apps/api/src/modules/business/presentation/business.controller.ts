import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Actor, CurrentUser, Public, Roles } from '@/shared/presentation/auth';
import { ZodPipe } from '@/shared/presentation/zod';
import { DomainError } from '@/shared/domain/domain-error';
import { SettingsService } from '../application/settings.service';
import { ClosuresService, closureInput } from '../application/closures.service';
import { LEGAL_KINDS, LegalKind, LegalService, legalDraftInput } from '../application/legal.service';
import { SETTINGS_SCHEMAS, SettingsKey } from '../domain/settings';

function settingsKey(raw: string): SettingsKey {
  if (!(raw in SETTINGS_SCHEMAS)) throw DomainError.notFound('Seção de configuração');
  return raw as SettingsKey;
}

function legalKind(raw: string): LegalKind {
  const kind = raw.toUpperCase();
  if (!(LEGAL_KINDS as readonly string[]).includes(kind)) throw DomainError.notFound('Documento');
  return kind as LegalKind;
}

@Controller()
export class PublicBusinessController {
  constructor(
    private readonly settings: SettingsService,
    private readonly legal: LegalService,
  ) {}

  @Public()
  @Get('business')
  async info() {
    const [shop, hours] = await Promise.all([this.settings.get('shop'), this.settings.get('hours')]);
    return { shop, hours: hours.weekly };
  }

  @Public()
  @Get('legal/:kind')
  async legalDocument(@Param('kind') kind: string) {
    const doc = await this.legal.current(legalKind(kind));
    if (!doc) throw DomainError.notFound('Documento');
    return doc;
  }
}

@Controller('admin/settings')
@Roles('ADMIN')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly closures: ClosuresService,
    private readonly legal: LegalService,
  ) {}

  @Get('closures')
  listClosures() {
    return this.closures.list();
  }

  @Post('closures')
  createClosure(@Body(new ZodPipe(closureInput)) body: z.infer<typeof closureInput>) {
    return this.closures.create(body);
  }

  @Delete('closures/:id')
  async removeClosure(@Param('id') id: string) {
    await this.closures.remove(id);
    return { ok: true };
  }

  @Get('legal/:kind')
  legalView(@Param('kind') kind: string) {
    return this.legal.view(legalKind(kind));
  }

  @Put('legal/:kind')
  saveLegalDraft(
    @Param('kind') kind: string,
    @Body(new ZodPipe(legalDraftInput)) body: z.infer<typeof legalDraftInput>,
    @CurrentUser() actor: Actor,
  ) {
    return this.legal.saveDraft(legalKind(kind), body.content, actor);
  }

  @Post('legal/:kind/publish')
  publishLegal(@Param('kind') kind: string, @CurrentUser() actor: Actor) {
    return this.legal.publish(legalKind(kind), actor);
  }

  @Get(':key')
  async get(@Param('key') key: string) {
    const k = settingsKey(key);
    const [value, updatedAt] = await Promise.all([this.settings.get(k), this.settings.updatedAt(k)]);
    return { value, updatedAt };
  }

  @Put(':key')
  async update(@Param('key') key: string, @Body() body: unknown, @CurrentUser() actor: Actor) {
    const k = settingsKey(key);
    const value = await this.settings.update(k, body, actor.id);
    return { value, updatedAt: new Date() };
  }
}
