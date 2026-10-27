import pino from 'pino';

export function createLogger(level: string, pretty: boolean) {
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
