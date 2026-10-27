import { Router } from 'express';
import type { AppContext } from '../context.js';
import { KEY_PATTERN, LocalStorage } from './storage.js';

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  pdf: 'application/pdf',
};

/**
 * Serves files for the LOCAL storage driver only. Public keys are served
 * directly; private keys require a valid, unexpired signature.
 */
export function filesRoutes(ctx: AppContext) {
  const router = Router();
  const storage = ctx.storage;
  if (!(storage instanceof LocalStorage)) return router;

  router.get('/files/{*key}', async (req, res) => {
    const key = ([] as string[]).concat((req.params as { key?: string | string[] }).key ?? []).join('/');
    if (!KEY_PATTERN.test(key)) return res.status(404).end();
    if (key.startsWith('private/')) {
      const { exp, sig } = req.query as Record<string, string | undefined>;
      if (!storage.verifySignature(key, exp, sig)) return res.status(403).json({ error: { code: 'forbidden', message: 'Link is invalid or has expired' } });
    }
    try {
      const body = await storage.read(key);
      const ext = key.split('.').pop()!;
      res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', key.startsWith('public/') ? 'public, max-age=31536000, immutable' : 'private, no-store');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.send(body);
    } catch {
      res.status(404).end();
    }
  });
  return router;
}
