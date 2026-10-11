import { Injectable } from '@nestjs/common';
import { DomainError } from '@/shared/domain/domain-error';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { parseJson, toJson } from '@/shared/infrastructure/json';
import { DEFAULT_SETTINGS, SETTINGS_SCHEMAS, SettingsKey, SettingsOf } from '../domain/settings';

/**
 * Leitura e gravação das configurações. Os outros módulos dependem deste
 * serviço (e não da tabela) para saber horários, regras de agenda, taxas etc.
 */
@Injectable()
export class SettingsService {
  private cache = new Map<SettingsKey, unknown>();

  constructor(private readonly prisma: PrismaService) {}

  async get<K extends SettingsKey>(key: K): Promise<SettingsOf<K>> {
    if (this.cache.has(key)) return this.cache.get(key) as SettingsOf<K>;
    const row = await this.prisma.setting.findUnique({ where: { key } });
    const stored = parseJson<Partial<SettingsOf<K>>>(row?.value, {});
    // Mescla com o padrão para que campos novos ganhem valor sem migração.
    const merged = { ...DEFAULT_SETTINGS[key], ...stored } as SettingsOf<K>;
    const parsed = SETTINGS_SCHEMAS[key].safeParse(merged);
    const value = (parsed.success ? parsed.data : DEFAULT_SETTINGS[key]) as SettingsOf<K>;
    this.cache.set(key, value);
    return value;
  }

  async update<K extends SettingsKey>(key: K, input: unknown, actorId?: string): Promise<SettingsOf<K>> {
    const current = await this.get(key);
    const candidate = { ...current, ...(input as object) };
    const parsed = SETTINGS_SCHEMAS[key].safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new DomainError('invalid_settings', issue?.message ?? 'Configuração inválida.', 'validation', {
        path: issue?.path.join('.'),
      });
    }
    const value = parsed.data as SettingsOf<K>;
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: toJson(value), updatedById: actorId },
      update: { value: toJson(value), updatedById: actorId },
    });
    this.cache.set(key, value);
    return value;
  }

  async updatedAt(key: SettingsKey): Promise<Date | null> {
    const row = await this.prisma.setting.findUnique({ where: { key }, select: { updatedAt: true } });
    return row?.updatedAt ?? null;
  }
}
