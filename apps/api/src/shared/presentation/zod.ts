import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodError, ZodType, ZodTypeDef } from 'zod';

/** Valida o corpo/consulta com um schema zod: `@Body(new ZodPipe(schema))`. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly schema: ZodType<T, ZodTypeDef, any>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) throw toBadRequest(result.error);
    return result.data;
  }
}

function toBadRequest(error: ZodError): BadRequestException {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return new BadRequestException({
    code: 'invalid_input',
    message: 'Confira os campos destacados.',
    fields,
  });
}
