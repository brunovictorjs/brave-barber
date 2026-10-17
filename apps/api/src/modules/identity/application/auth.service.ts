import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { AppConfig } from '@/config/app-config.service';
import { avatarFor, fullName } from '@/shared/domain/avatar';
import { DomainError } from '@/shared/domain/domain-error';
import { parseRoles, ROLE_LABEL } from '@/shared/domain/roles';
import { newId } from '@/shared/domain/text';
import { Clock } from '@/shared/infrastructure/clock';
import { PrismaService } from '@/shared/infrastructure/prisma/prisma.service';
import { LegalService } from '@/modules/business/application/legal.service';
import { User } from '../domain/user';
import { UserRepository } from '../domain/user.repository';

/** Login (Google ou desenvolvimento) e sessão em JWT. */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly google: OAuth2Client | null;

  constructor(
    private readonly users: UserRepository,
    private readonly jwt: JwtService,
    private readonly legal: LegalService,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {
    const clientId = config.get('GOOGLE_CLIENT_ID');
    const clientSecret = config.get('GOOGLE_CLIENT_SECRET');
    // 'postmessage' é o redirect_uri do fluxo de código em popup do Google Identity Services.
    this.google = clientId && clientSecret ? new OAuth2Client(clientId, clientSecret, 'postmessage') : null;
  }

  get providers() {
    return { google: !!this.google, googleClientId: this.config.get('GOOGLE_CLIENT_ID') || null, dev: this.config.get('DEV_LOGIN') };
  }

  private async issue(user: User): Promise<string> {
    user.touch(this.clock.now());
    await this.users.save(user);
    return this.jwt.signAsync({ sub: user.id, name: user.name, email: user.snapshot.email, roles: user.snapshot.roles });
  }

  /**
   * Recebe o código de autorização do popup do Google, troca pelo ID token
   * e entra (ou cria a conta).
   */
  async loginWithGoogle(code: string): Promise<{ token: string; isNew: boolean }> {
    if (!this.google) throw new DomainError('google_disabled', 'O login com Google não está configurado.');
    const google = this.google;
    const ticket = await google
      .getToken(code)
      .then(({ tokens }) => (tokens.id_token ? google.verifyIdToken({ idToken: tokens.id_token, audience: this.config.get('GOOGLE_CLIENT_ID') }) : null))
      .catch((e: unknown) => {
        this.logger.warn(`Falha ao trocar o código do Google: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      });
    const payload = ticket?.getPayload();
    if (!payload?.email || !payload.email_verified) throw new DomainError('google_invalid', 'Não foi possível confirmar sua conta Google.', 'unauthorized');

    let user = (await this.users.findByGoogleId(payload.sub)) ?? (await this.users.findByEmail(payload.email));
    const isNew = !user;
    if (!user) {
      user = User.register({
        id: newId(),
        email: payload.email,
        firstName: payload.given_name ?? payload.name ?? '',
        lastName: payload.family_name ?? '',
        googleId: payload.sub,
        avatarUrl: payload.picture ?? null,
        now: this.clock.now(),
      });
    } else {
      // Convites feitos pelo admin chegam sem googleId; o primeiro login vincula.
      user.linkGoogle(payload.sub, payload.picture ?? null);
    }
    if (!user.snapshot.active) throw DomainError.forbidden('Sua conta está desativada. Fale com a barbearia.');
    return { token: await this.issue(user), isNew };
  }

  /** Só em desenvolvimento: entra como qualquer usuário do seed. */
  async devLogin(userId: string): Promise<{ token: string }> {
    if (!this.config.get('DEV_LOGIN')) throw DomainError.forbidden('Login de desenvolvimento desligado.');
    const user = await this.users.findById(userId);
    if (!user) throw DomainError.notFound('Usuário');
    return { token: await this.issue(user) };
  }

  async devUsers() {
    if (!this.config.get('DEV_LOGIN')) return [];
    const rows = await this.prisma.user.findMany({ where: { active: true }, orderBy: [{ createdAt: 'asc' }], take: 40 });
    return rows.map((u) => {
      const roles = parseRoles(u.roles);
      return { id: u.id, name: fullName(u), email: u.email, roles, label: roles.map((r) => ROLE_LABEL[r]).join(' · '), avatar: avatarFor(u) };
    });
  }

  async me(userId: string) {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, include: { staffProfile: true } });
    if (!row || !row.active) throw new DomainError('session_invalid', 'Sua sessão expirou. Entre de novo.', 'unauthorized');
    const roles = parseRoles(row.roles);
    const [pendingLegal, stats] = await Promise.all([
      this.legal.pendingFor(userId),
      Promise.all([
        this.prisma.order.count({ where: { customerId: userId, status: 'COMPLETED' } }),
        this.prisma.favorite.count({ where: { userId } }),
        this.prisma.review.count({ where: { customerId: userId } }),
      ]),
    ]);
    return {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      name: fullName(row),
      phone: row.phone,
      about: row.about,
      specialties: JSON.parse(row.specialties) as string[],
      avatar: avatarFor(row),
      roles,
      onboarded: !!row.onboardedAt,
      staff: row.staffProfile ? { headline: row.staffProfile.headline, chairLabel: row.staffProfile.chairLabel, sinceYear: row.staffProfile.sinceYear } : null,
      pendingLegal,
      stats: { completed: stats[0], favorites: stats[1], reviews: stats[2] },
      googleLinked: !!row.googleId,
    };
  }

  /** Renova o token quando os papéis mudam (ex.: admin promoveu a pessoa). */
  async refresh(userId: string): Promise<string> {
    const user = await this.users.findById(userId);
    if (!user || !user.snapshot.active) throw new DomainError('session_invalid', 'Sua sessão expirou. Entre de novo.', 'unauthorized');
    return this.issue(user);
  }
}
