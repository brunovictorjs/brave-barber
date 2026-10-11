import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Role } from '@/shared/domain/roles';

export const SESSION_COOKIE = 'bb_session';

/** Quem está fazendo a requisição (extraído do JWT). */
export interface Actor {
  id: string;
  name: string;
  email: string;
  roles: Role[];
}

export function hasRole(actor: Actor | undefined, ...roles: Role[]): boolean {
  return !!actor && actor.roles.some((r) => roles.includes(r));
}

const PUBLIC_KEY = 'auth:public';
const ROLES_KEY = 'auth:roles';

/** Rota aberta: não exige login (mas lê a sessão se houver). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Exige ao menos um dos papéis. ADMIN sempre passa. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor | undefined => {
  return ctx.switchToHttp().getRequest<Request & { actor?: Actor }>().actor;
});

interface SessionPayload {
  sub: string;
  name: string;
  email: string;
  roles: Role[];
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { actor?: Actor }>();
    const token = readToken(req);
    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<SessionPayload>(token);
        req.actor = { id: payload.sub, name: payload.name, email: payload.email, roles: payload.roles };
      } catch {
        req.actor = undefined;
      }
    }

    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
    if (!req.actor) throw new UnauthorizedException({ code: 'unauthenticated', message: 'Entre na sua conta para continuar.' });

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (required?.length && !hasRole(req.actor, 'ADMIN', ...required)) {
      throw new ForbiddenException({ code: 'forbidden', message: 'Seu perfil não tem acesso a esta área.' });
    }
    return true;
  }
}

function readToken(req: Request): string | undefined {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (cookie) return cookie;
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}
