import { Injectable } from '@nestjs/common';
import type { User as UserRow } from '@prisma/client';
import { parseRoles, serializeRoles } from '@/shared/domain/roles';
import { parseJson, toJson } from '@/shared/infrastructure/json';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { User } from '../domain/user';
import { UserRepository } from '../domain/user.repository';

function toUser(row: UserRow): User {
  return User.restore(row.id, {
    email: row.email,
    googleId: row.googleId,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    avatarUrl: row.avatarUrl,
    about: row.about,
    specialties: parseJson<string[]>(row.specialties, []),
    roles: parseRoles(row.roles),
    active: row.active,
    onboardedAt: row.onboardedAt,
    lastAccessAt: row.lastAccessAt,
    createdAt: row.createdAt,
  });
}

@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string) {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toUser(row) : null;
  }

  async findByEmail(email: string) {
    const row = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    return row ? toUser(row) : null;
  }

  async findByGoogleId(googleId: string) {
    const row = await this.prisma.user.findUnique({ where: { googleId } });
    return row ? toUser(row) : null;
  }

  async countActiveAdmins() {
    return this.prisma.user.count({ where: { active: true, roles: { contains: 'ADMIN' } } });
  }

  async save(user: User): Promise<void> {
    const u = user.snapshot;
    const data = {
      email: u.email,
      googleId: u.googleId,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      avatarUrl: u.avatarUrl,
      about: u.about,
      specialties: toJson(u.specialties),
      roles: serializeRoles(u.roles),
      active: u.active,
      onboardedAt: u.onboardedAt,
      lastAccessAt: u.lastAccessAt,
    };
    await this.prisma.user.upsert({ where: { id: user.id }, create: { id: user.id, createdAt: u.createdAt, ...data }, update: data });
    // Barbeiro precisa de cadastro profissional (comissão, vitrine).
    if (u.roles.includes('BARBER')) {
      const exists = await this.prisma.staffProfile.findUnique({ where: { userId: user.id } });
      if (!exists) {
        const defaults = await this.prisma.setting.findUnique({ where: { key: 'commission' } });
        const parsed = parseJson<{ defaultServiceBps?: number; defaultProductBps?: number }>(defaults?.value, {});
        await this.prisma.staffProfile.create({
          data: { userId: user.id, serviceCommissionBps: parsed.defaultServiceBps ?? 5500, productCommissionBps: parsed.defaultProductBps ?? 1500 },
        });
      }
    }
  }
}
