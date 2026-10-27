import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { AppError, fromPgError } from '../common/errors.js';
import type { Logger } from '../common/logger.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
};

/** Single place that turns any thrown error into the standard `{ error }` response. */
export function errorHandler(log: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    let appError: AppError | null = err instanceof AppError ? err : fromPgError(err);

    if (!appError && err instanceof MulterError) {
      appError = new AppError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, 'upload_rejected', err.message);
    }
    if (!appError && (err as { type?: string }).type === 'entity.parse.failed') {
      appError = new AppError(400, 'invalid_json', 'Request body is not valid JSON');
    }
    if (!appError && (err as { type?: string }).type === 'entity.too.large') {
      appError = new AppError(413, 'payload_too_large', 'Request body is too large');
    }

    if (!appError) {
      log.error({ err, method: req.method, url: req.originalUrl }, 'unhandled error');
      appError = new AppError(500, 'internal_error', 'Something went wrong');
    }

    res.status(appError.status).json({
      error: { code: appError.code, message: appError.message, ...(appError.details ? { details: appError.details } : {}) },
    });
  };
}
