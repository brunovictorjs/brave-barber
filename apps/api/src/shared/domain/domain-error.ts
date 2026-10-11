/**
 * Erro de regra de negócio. A camada HTTP traduz o `kind` em status:
 * validation → 422, not_found → 404, conflict → 409, forbidden → 403.
 * A mensagem é escrita para quem usa o sistema, em português.
 */
export type DomainErrorKind = 'validation' | 'not_found' | 'conflict' | 'forbidden' | 'unauthorized';

export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly kind: DomainErrorKind = 'validation',
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  static notFound(what: string, code = 'not_found'): DomainError {
    return new DomainError(code, `${what} não encontrado.`, 'not_found');
  }

  static conflict(code: string, message: string): DomainError {
    return new DomainError(code, message, 'conflict');
  }

  static forbidden(message = 'Você não tem permissão para fazer isso.'): DomainError {
    return new DomainError('forbidden', message, 'forbidden');
  }
}

export function invariant(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DomainError(code, message);
}
