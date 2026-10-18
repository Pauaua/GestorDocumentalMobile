import { z } from 'zod';
import { badRequest } from '../lib/errors';

/** Valida con Zod y lanza 400 con el detalle de los campos inválidos. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(
      'Datos inválidos',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}
