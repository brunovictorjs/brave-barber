import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppConfig } from '@/config/app-config.service';
import { avatarFor, fullName } from '@/shared/domain/avatar';
import { formatHm, minutesOfDay, toDateKey } from '@/shared/domain/business-time';
import { DomainError, invariant } from '@/shared/domain/domain-error';
import { parseRoles, Role, ROLES } from '@/shared/domain/roles';
import { newId } from '@/shared/domain/text';
import type { Actor } from '@/shared/presentation/auth';
import { Clock } from '@/shared/infrastructure/clock';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { User } from '../domain/user';
import { UserRepository } from '../domain/user.repository';

export const USER_TABS = ['staff', 'receptionists', 'clients', 'admins'] as const;
export type UserTab = (typeof USER_TABS)[number];

export const inviteInput = z.object({
  email: z.string().email('Informe um e-mail válido'),
  firstName: z.string().trim().min(2, 'Informe o nome'),
  lastName: z.string().trim().default(''),
  roles: z.array(z.enum(ROLES)).min(1, 'Escolha um papel'),
  headline: z.string().max(60).optional(),
});

export const updateUserInput = z.object({
  roles: z.array(z.enum(ROLES)).min(1).optional(),
  active: z.boolean().optional(),
  headline: z.string().max(60).optional(),
  chairLabel: z.string().max(20).nullable().optional(),
  sinceYear: z.number().int().min(1990).max(2100).nullable().optional(),
});

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const TAB_FILTER: Record<UserTab, Prisma.UserWhereInput> = {
  staff: { roles: { contains: 'BARBER' } },
  receptionists: { roles: { contains: 'RECEPTIONIST' } },
  clients: { roles: { contains: 'CLIENT' } },
  admins: { roles: { contains: 'ADMIN' } },
};

/** Usuários e papéis (tela do admin). */
@Injectable()
export class UsersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserRepository,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  private lastAccess(date: Date | null): string | null {
    if (!date) return null;
    const tz = this.config.timeZone;
    const today = toDateKey(this.clock.now(), tz);
    const day = toDateKey(date, tz);
    const time = formatHm(minutesOfDay(date, tz));
    if (day === today) return `hoje, ${time}`;
    const yesterday = toDateKey(new Date(this.clock.now().getTime() - 86_400_000), tz);
    if (day === yesterday) return `ontem, ${time}`;
    return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  }

  async counts() {
    const entries = await Promise.all(USER_TABS.map(async (t) => [t, await this.prisma.user.count({ where: { ...TAB_FILTER[t], active: true } })] as const));
    return Object.fromEntries(entries) as Record<UserTab, number>;
  }

  async list(tab: UserTab, opts: { q?: string; active?: boolean; page: number; pageSize: number }) {
    const where: Prisma.UserWhereInput = {
      ...TAB_FILTER[tab],
      active: opts.active ?? true,
      OR: opts.q ? [{ firstName: this.prisma.contains(opts.q) }, { lastName: this.prisma.contains(opts.q) }, { email: this.prisma.contains(opts.q) }] : undefined,
    };
    const [rows, total, counts] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { staffProfile: true },
        orderBy: tab === 'clients' ? { createdAt: 'desc' } : { firstName: 'asc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      this.prisma.user.count({ where }),
      this.counts(),
    ]);
    const ids = rows.map((r) => r.id);

    const extra = new Map<string, Record<string, unknown>>();
    if (tab === 'staff') {
      const [served, ratings] = await Promise.all([
        this.prisma.order.groupBy({ by: ['barberId'], where: { barberId: { in: ids }, status: 'COMPLETED' }, _count: true }),
        this.prisma.review.groupBy({ by: ['barberId'], where: { barberId: { in: ids } }, _avg: { barberRating: true } }),
      ]);
      for (const r of rows) {
        const rating = ratings.find((x) => x.barberId === r.id)?._avg.barberRating;
        const specialties = JSON.parse(r.specialties) as string[];
        extra.set(r.id, {
          served: served.find((x) => x.barberId === r.id)?._count ?? 0,
          rating: rating ? Math.round(rating * 10) / 10 : null,
          serviceBps: r.staffProfile?.serviceCommissionBps ?? null,
          productBps: r.staffProfile?.productCommissionBps ?? null,
          headline: r.staffProfile?.headline ?? '',
          specialties,
          profileStatus: !r.about ? 'missing_about' : specialties.length === 0 ? 'missing_specialties' : 'complete',
        });
      }
    }
    if (tab === 'clients') {
      const [orders, late] = await Promise.all([
        this.prisma.order.groupBy({ by: ['customerId'], where: { customerId: { in: ids }, status: { notIn: ['CART'] } }, _count: true }),
        this.prisma.order.groupBy({ by: ['customerId'], where: { customerId: { in: ids }, OR: [{ status: 'NO_SHOW' }, { events: { some: { type: 'started', meta: { contains: '"late":true' } } } }] }, _count: true }),
      ]);
      for (const r of rows) {
        extra.set(r.id, {
          orders: orders.find((x) => x.customerId === r.id)?._count ?? 0,
          lateCount: late.find((x) => x.customerId === r.id)?._count ?? 0,
          since: `${MONTHS[r.createdAt.getMonth()]}/${r.createdAt.getFullYear()}`,
        });
      }
    }

    return {
      tab,
      counts,
      total,
      page: opts.page,
      pageSize: opts.pageSize,
      items: rows.map((r) => ({
        id: r.id,
        name: fullName(r),
        email: r.email,
        phone: r.phone,
        avatar: avatarFor(r),
        roles: parseRoles(r.roles),
        active: r.active,
        lastAccess: this.lastAccess(r.lastAccessAt),
        invited: !r.googleId && !r.lastAccessAt,
        ...(extra.get(r.id) ?? {}),
      })),
    };
  }

  async invite(actor: Actor, input: z.infer<typeof inviteInput>) {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      existing.setRoles([...new Set([...existing.snapshot.roles, ...input.roles])]);
      existing.activate();
      await this.users.save(existing);
      await this.applyStaff(existing.id, input);
      return { id: existing.id, existed: true };
    }
    const user = User.register({ id: newId(), email: input.email, firstName: input.firstName, lastName: input.lastName, roles: input.roles, now: this.clock.now() });
    await this.users.save(user);
    await this.applyStaff(user.id, input);
    return { id: user.id, existed: false };
  }

  private async applyStaff(userId: string, input: { headline?: string }) {
    if (input.headline !== undefined) {
      await this.prisma.staffProfile.updateMany({ where: { userId }, data: { headline: input.headline } });
    }
  }

  async update(actor: Actor, userId: string, input: z.infer<typeof updateUserInput>) {
    const user = await this.users.findById(userId);
    if (!user) throw DomainError.notFound('Usuário');
    const removingAdmin = (input.roles && !input.roles.includes('ADMIN') && user.snapshot.roles.includes('ADMIN')) || (input.active === false && user.snapshot.roles.includes('ADMIN'));
    if (removingAdmin) {
      invariant((await this.users.countActiveAdmins()) > 1, 'last_admin', 'A casa precisa de pelo menos um administrador ativo.');
    }
    invariant(!(userId === actor.id && input.active === false), 'self_deactivate', 'Você não pode desativar a própria conta.');
    if (input.roles) user.setRoles(input.roles as Role[]);
    if (input.active === true) user.activate();
    if (input.active === false) user.deactivate();
    await this.users.save(user);
    if (input.headline !== undefined || input.chairLabel !== undefined || input.sinceYear !== undefined) {
      await this.prisma.staffProfile.updateMany({
        where: { userId },
        data: { headline: input.headline, chairLabel: input.chairLabel, sinceYear: input.sinceYear },
      });
    }
    return { ok: true };
  }
}
