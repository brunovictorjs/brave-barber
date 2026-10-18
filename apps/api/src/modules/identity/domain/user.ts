import { AggregateRoot } from '@/shared/domain/aggregate-root';
import { invariant } from '@/shared/domain/domain-error';
import type { Role } from '@/shared/domain/roles';

export interface UserProps {
  email: string;
  googleId: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  about: string | null;
  roles: Role[];
  active: boolean;
  onboardedAt: Date | null;
  lastAccessAt: Date | null;
  createdAt: Date;
}

const PHONE = /^\(?\d{2}\)?\s?9?\s?\d{4}-?\d{4}$/;

/** Pessoa com acesso ao sistema: cliente, barbeiro, balconista ou administrador. */
export class User extends AggregateRoot {
  private constructor(
    id: string,
    private props: UserProps,
  ) {
    super(id);
  }

  static register(input: { id: string; email: string; firstName: string; lastName: string; googleId?: string | null; avatarUrl?: string | null; roles?: Role[]; now: Date }): User {
    invariant(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email), 'invalid_email', 'Informe um e-mail válido.');
    return new User(input.id, {
      email: input.email.toLowerCase(),
      googleId: input.googleId ?? null,
      firstName: input.firstName.trim() || input.email.split('@')[0]!,
      lastName: input.lastName.trim(),
      phone: null,
      avatarUrl: input.avatarUrl ?? null,
      about: null,
      roles: input.roles?.length ? input.roles : ['CLIENT'],
      active: true,
      onboardedAt: null,
      lastAccessAt: null,
      createdAt: input.now,
    });
  }

  static restore(id: string, props: UserProps): User {
    return new User(id, props);
  }

  get snapshot(): Readonly<UserProps> {
    return this.props;
  }

  get name(): string {
    return `${this.props.firstName} ${this.props.lastName}`.trim();
  }

  isStaff(): boolean {
    return this.props.roles.some((r) => r !== 'CLIENT');
  }

  linkGoogle(googleId: string, avatarUrl: string | null): void {
    this.props.googleId = googleId;
    if (!this.props.avatarUrl && avatarUrl) this.props.avatarUrl = avatarUrl;
  }

  touch(now: Date): void {
    this.props.lastAccessAt = now;
  }

  updateIdentity(input: { firstName: string; lastName: string; phone: string | null }): void {
    invariant(input.firstName.trim().length >= 2, 'invalid_name', 'Informe seu nome.');
    const phone = input.phone?.trim() || null;
    invariant(!phone || PHONE.test(phone), 'invalid_phone', 'Use o formato (81) 9 0000-0000.');
    this.props.firstName = input.firstName.trim();
    this.props.lastName = input.lastName.trim();
    this.props.phone = phone;
  }

  updateAbout(input: { about: string | null }): void {
    const about = input.about?.trim() || null;
    invariant(!about || about.length <= 400, 'about_too_long', 'O texto "sobre mim" vai até 400 caracteres.');
    this.props.about = about;
  }

  setAvatar(url: string | null): void {
    this.props.avatarUrl = url;
  }

  completeOnboarding(now: Date): void {
    this.props.onboardedAt ??= now;
  }

  setRoles(roles: Role[]): void {
    invariant(roles.length > 0, 'no_roles', 'Escolha ao menos um papel.');
    this.props.roles = [...new Set(roles)];
  }

  deactivate(): void {
    this.props.active = false;
  }

  activate(): void {
    this.props.active = true;
  }

  /** Perfil público completo: entra na vitrine "Quem vai te atender". */
  get publicProfileComplete(): boolean {
    return !!this.props.about;
  }
}
