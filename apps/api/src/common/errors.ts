export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have permission to do this') => new AppError(403, 'forbidden', message);
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (message: string) => new AppError(409, 'conflict', message);
export const tooMany = (message = 'Too many attempts, try again later') => new AppError(429, 'rate_limited', message);

/** Maps Postgres constraint errors to API errors so callers get 409/400 instead of 500. */
export function fromPgError(err: unknown): AppError | null {
  const e = err as { code?: string; constraint?: string };
  if (e?.code === '23505') return conflict(`Already exists${e.constraint ? ` (${e.constraint})` : ''}`);
  if (e?.code === '23503') return badRequest('Referenced record does not exist');
  if (e?.code === '23514') return badRequest('Value violates a constraint');
  return null;
}
