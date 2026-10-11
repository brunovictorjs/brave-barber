import type { Actor } from '@/shared/presentation/auth';
import type { Role } from '@/shared/domain/roles';
import type { ActorRef } from '../domain/order.types';

/**
 * Converte quem está logado no "ator" que o pedido registra. Quando a pessoa
 * tem vários papéis, vale o primeiro da ordem de preferência da operação.
 */
export function actorRef(actor: Actor, prefer: Role[] = ['BARBER', 'RECEPTIONIST', 'ADMIN', 'CLIENT']): ActorRef {
  const role = prefer.find((r) => actor.roles.includes(r)) ?? actor.roles[0] ?? 'CLIENT';
  return { id: actor.id, name: actor.name, role };
}
