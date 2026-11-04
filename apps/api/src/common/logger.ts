import { createRequire } from 'node:module';
import pino from 'pino';

/** pino-pretty is a dev dependency; delivery builds don't have it and log plain JSON. */
function hasPretty() {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

export function createLogger(level: string, pretty: boolean) {
  pretty &&= hasPretty();
  return pino({
    level,
    redact: {
      paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', '*.password', '*.code', '*.token'],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } } : {}),
  });
}

export type Logger = ReturnType<typeof createLogger>;
