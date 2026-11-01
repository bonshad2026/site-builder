import { randomUUID } from 'node:crypto';
import { requestTypeConfig } from '@site-builder/shared';
import { fileTypeFromBuffer } from 'file-type';
import multer from 'multer';
import type pg from 'pg';
import { z } from 'zod';
import { AppError, badRequest } from '../../common/errors.js';
import type { ApiRouter } from '../../common/http.js';
import type { AppContext } from '../../context.js';
import type { RequestHandler } from 'express';
import { loadSettings } from './context.js';

/** What a file question may accept, identified from the file's bytes (never its name). */
const KINDS: Record<string, { ext: string; kind: 'image' | 'pdf' }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  'application/pdf': { ext: 'pdf', kind: 'pdf' },
};

const LINK_SECONDS = 600;

export interface RequestFile {
  id: string;
  field: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  url: string;
}

/** A request's files with short-lived download links (files are private). */
export async function filesOf(ctx: AppContext, db: pg.Pool | pg.PoolClient, leadId: string): Promise<RequestFile[]> {
  const { rows } = await db.query<{ id: string; field: string; original_name: string; content_type: string; size_bytes: number; storage_key: string }>(
    'SELECT id, field, original_name, content_type, size_bytes, storage_key FROM request_files WHERE lead_id = $1 ORDER BY created_at',
    [leadId],
  );
  return Promise.all(
    rows.map(async (r) => ({ id: r.id, field: r.field, name: r.original_name, contentType: r.content_type, sizeBytes: r.size_bytes, url: await ctx.storage.signedUrl(r.storage_key, LINK_SECONDS) })),
  );
}

/**
 * The uploads named in a request's file answers: each must exist, be unattached, belong to this
 * request type and field, and be recent. Returns their names by id, or the fields that failed.
 */
export async function checkUploads(db: pg.Pool | pg.PoolClient, type: string, answers: Record<string, unknown>, fileFields: string[]) {
  const names: Record<string, string> = {};
  const bad: string[] = [];
  for (const field of fileFields) {
    const ids = answers[field];
    if (!Array.isArray(ids) || !ids.length) continue;
    const valid = ids.filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id));
    const { rows } = await db.query<{ id: string; original_name: string }>(
      `SELECT id, original_name FROM request_files WHERE id = ANY($1::uuid[]) AND lead_id IS NULL AND request_type = $2 AND field = $3 AND created_at > now() - interval '1 day'`,
      [valid, type, field],
    );
    if (rows.length !== ids.length) bad.push(field);
    for (const r of rows) names[r.id] = r.original_name;
  }
  return { names, bad };
}

export async function attachUploads(db: pg.Pool | pg.PoolClient, leadId: string, ids: string[]) {
  if (ids.length) await db.query('UPDATE request_files SET lead_id = $1 WHERE id = ANY($2::uuid[]) AND lead_id IS NULL', [leadId, ids]);
}

/**
 * Visitors upload a file for a file question before sending the form: the type and size are
 * checked against that question; the file is stored privately. Uploads that never became part
 * of a request are cleaned up here, a day later.
 */
export function registerUploadRoute(r: ApiRouter, ctx: AppContext, limiter: RequestHandler) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5 } });
  r.route(
    {
      method: 'post',
      path: '/uploads',
      summary: 'Upload a file for a file question (multipart: file, type, field)',
      status: 201,
      rawBody: true,
      middleware: [limiter, upload.single('file')],
    },
    async ({ req }) => {
      const db = req.tenant!.db;
      const file = req.file;
      if (!file) throw badRequest('Attach a file in the "file" field');
      const meta = z.object({ type: z.string().max(40), field: z.string().max(40) }).safeParse(req.body ?? {});
      if (!meta.success) throw badRequest('Say which form and question the file is for');
      const settings = await loadSettings(db);
      const question = requestTypeConfig(settings, meta.data.type)?.fields.find((f) => f.id === meta.data.field && f.type === 'file');
      if (!question) throw badRequest('This question does not take files');
      const detected = await fileTypeFromBuffer(file.buffer);
      const kind = detected && KINDS[detected.mime];
      if (!kind || !question.files.kinds.includes(kind.kind)) {
        throw new AppError(415, 'unsupported_file', `Allowed files: ${question.files.kinds.join(', ')}`, [{ path: 'file', message: 'type', code: 'unsupported_file', options: question.files.kinds }]);
      }
      if (file.size > question.files.maxMb * 1024 * 1024) {
        throw new AppError(413, 'file_too_large', `Files can be at most ${question.files.maxMb} MB`, [{ path: 'file', message: 'size', code: 'too_big', maximum: question.files.maxMb }]);
      }

      // Uploads that never became part of a request.
      const stale = await db.query<{ storage_key: string }>(`DELETE FROM request_files WHERE lead_id IS NULL AND created_at < now() - interval '1 day' RETURNING storage_key`);
      for (const s of stale.rows) await ctx.storage.delete(s.storage_key).catch(() => undefined);

      const now = new Date();
      const id = randomUUID();
      const key = `private/tenants/${req.tenant!.id}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${kind.ext}`;
      await ctx.storage.put(key, file.buffer, detected!.mime);
      const name = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 200);
      await db.query(
        `INSERT INTO request_files (id, request_type, field, storage_key, original_name, content_type, size_bytes) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, meta.data.type, meta.data.field, key, name, detected!.mime, file.size],
      );
      return { data: { id, name, sizeBytes: file.size, kind: kind.kind } };
    },
  );
}
