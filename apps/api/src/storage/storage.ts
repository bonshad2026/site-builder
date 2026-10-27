import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Env } from '../config/env.js';
import { hmac, safeEqual } from '../common/crypto.js';

export type Visibility = 'public' | 'private';

/**
 * Object keys look like `public/tenants/<tenantId>/<yyyy>/<mm>/<uuid>.<ext>`.
 * The visibility prefix lets bucket policies (or the local file route) expose
 * only public objects; private objects are reachable through signed URLs only.
 */
export const KEY_PATTERN = /^(public|private)\/tenants\/[0-9a-f-]{36}\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

export interface StorageAdapter {
  readonly driver: 'local' | 's3';
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
  signedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

/**
 * DEVELOPMENT adapter: files on local disk, served by the API's /files routes.
 * Use the S3 adapter for anything shared or long-lived.
 */
export class LocalStorage implements StorageAdapter {
  readonly driver = 'local' as const;
  constructor(
    private readonly root: string,
    private readonly baseUrl: string,
    private readonly signingKey: string,
  ) {}

  private resolve(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    return path.join(this.root, ...key.split('/'));
  }

  async put(key: string, body: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  publicUrl(key: string) {
    return `${this.baseUrl}/files/${key}`;
  }

  async signedUrl(key: string, expiresInSeconds: number) {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return `${this.baseUrl}/files/${key}?exp=${exp}&sig=${hmac(this.signingKey, `${key}:${exp}`)}`;
  }

  verifySignature(key: string, exp: string | undefined, sig: string | undefined): boolean {
    if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
    return safeEqual(sig, hmac(this.signingKey, `${key}:${exp}`));
  }
}

export class S3Storage implements StorageAdapter {
  readonly driver = 's3' as const;
  private readonly client: S3Client;

  constructor(private readonly env: Env) {
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }));
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }));
  }

  publicUrl(key: string) {
    const base = this.env.S3_PUBLIC_BASE_URL ?? `${this.env.S3_ENDPOINT}/${this.env.S3_BUCKET}`;
    return `${base}/${key}`;
  }

  signedUrl(key: string, expiresInSeconds: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }), { expiresIn: expiresInSeconds });
  }
}

export function createStorage(env: Env): StorageAdapter {
  return env.STORAGE_DRIVER === 's3'
    ? new S3Storage(env)
    : new LocalStorage(path.resolve(env.STORAGE_LOCAL_DIR), env.PUBLIC_API_URL, env.STORAGE_SIGNING_KEY);
}
