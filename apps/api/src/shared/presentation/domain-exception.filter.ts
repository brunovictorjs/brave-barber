import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, DomainErrorKind } from '@/shared/domain/domain-error';

const STATUS: Record<DomainErrorKind, number> = {
  validation: HttpStatus.UNPROCESSABLE_ENTITY,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  forbidden: HttpStatus.FORBIDDEN,
  unauthorized: HttpStatus.UNAUTHORIZED,
};

/** Resposta de erro única: `{ code, message, fields? }`. */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      res.status(STATUS[exception.kind]).json({ code: exception.code, message: exception.message, details: exception.details });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === 'object' && body !== null && 'code' in body
          ? body
          : { code: `http_${status}`, message: defaultMessage(status, body) };
      res.status(status).json(payload);
      return;
    }

    this.logger.error((exception as Error)?.message ?? exception, (exception as Error)?.stack);
    res.status(500).json({ code: 'internal_error', message: 'Algo deu errado do nosso lado. Tente de novo em instantes.' });
  }
}

function defaultMessage(status: number, body: unknown): string {
  if (status === 401) return 'Entre na sua conta para continuar.';
  if (status === 403) return 'Você não tem permissão para fazer isso.';
  if (status === 404) return 'Não encontrado.';
  if (typeof body === 'string') return body;
  const message = (body as { message?: unknown })?.message;
  return Array.isArray(message) ? message.join(', ') : String(message ?? 'Requisição inválida.');
}
