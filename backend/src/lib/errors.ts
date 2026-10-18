export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, message, 'BAD_REQUEST', details);
export const unauthorized = (message = 'No autenticado') => new HttpError(401, message, 'UNAUTHORIZED');
export const forbidden = (message = 'No tienes permiso para realizar esta acción') =>
  new HttpError(403, message, 'FORBIDDEN');
export const notFound = (message = 'Recurso no encontrado') => new HttpError(404, message, 'NOT_FOUND');
export const conflict = (message: string) => new HttpError(409, message, 'CONFLICT');
