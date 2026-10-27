import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { closeContext, createContext } from './context.js';

const env = loadEnv();
const ctx = createContext(env);
const app = createApp(ctx);

const server = app.listen(env.PORT, () => {
  ctx.log.info(`API listening on ${env.PUBLIC_API_URL} (storage: ${ctx.storage.driver}, email: ${ctx.email.name}, sms: ${ctx.sms.name})`);
});

async function shutdown(signal: string) {
  ctx.log.info(`${signal} received, shutting down`);
  server.close();
  await closeContext(ctx);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
