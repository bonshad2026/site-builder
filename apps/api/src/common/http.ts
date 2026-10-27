import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z, type AnyZodObject, type ZodTypeAny } from 'zod';
import { AppError } from './errors.js';

// Adds .openapi() to the Zod prototype, which the generator needs on every schema.
extendZodWithOpenApi(z);

/** Every route registers itself here, so OpenAPI docs cannot drift from the real validation. */
export const registry = new OpenAPIRegistry();

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Empty = z.ZodObject<Record<string, never>>;

interface RouteDef<P extends AnyZodObject, Q extends AnyZodObject, B extends ZodTypeAny> {
  method: Method;
  path: string;
  summary: string;
  params?: P;
  query?: Q;
  body?: B;
  status?: number;
  middleware?: RequestHandler[];
  /** Overrides the router-level security for docs (e.g. a public route on a private router). */
  auth?: boolean;
  /** Skip JSON body validation (multipart upload handlers parse their own input). */
  rawBody?: boolean;
}

export interface Ctx<P, Q, B> {
  req: Request;
  res: Response;
  params: P;
  query: Q;
  body: B;
}

export interface Envelope {
  data: unknown;
  meta?: Record<string, unknown>;
}

const empty: Empty = z.object({});

function parse<T extends ZodTypeAny>(schema: T, value: unknown, where: string): z.output<T> {
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    throw new AppError(400, 'validation_failed', `Invalid ${where}`, result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return result.data;
}

export class ApiRouter {
  readonly router = Router({ mergeParams: true });

  constructor(
    private readonly base: string,
    private readonly tag: string,
    private readonly authenticated: boolean,
  ) {}

  route<P extends AnyZodObject = Empty, Q extends AnyZodObject = Empty, B extends ZodTypeAny = Empty>(
    def: RouteDef<P, Q, B>,
    handler: (ctx: Ctx<z.output<P>, z.output<Q>, z.output<B>>) => Promise<Envelope | void>,
  ): this {
    this.router[def.method](def.path, ...(def.middleware ?? []), async (req: Request, res: Response) => {
      const params = parse(def.params ?? empty, req.params, 'path parameters') as z.output<P>;
      const query = parse(def.query ?? empty, req.query, 'query string') as z.output<Q>;
      const body = (def.rawBody ? undefined : parse(def.body ?? z.unknown(), req.body, 'request body')) as z.output<B>;
      const result = await handler({ req, res, params, query, body });
      if (res.headersSent) return;
      if (result === undefined) res.status(204).end();
      else res.status(def.status ?? 200).json(result);
    });

    const fullPath = `${this.base}${def.path}`.replace(/:(\w+)/g, '{$1}').replace(/\/$/, '') || '/';
    registry.registerPath({
      method: def.method,
      path: fullPath,
      summary: def.summary,
      tags: [this.tag],
      security: (def.auth ?? this.authenticated) ? [{ session: [] }] : [],
      request: {
        ...(def.params ? { params: def.params } : {}),
        ...(def.query ? { query: def.query } : {}),
        ...(def.body && !def.rawBody ? { body: { content: { 'application/json': { schema: def.body } } } } : {}),
      },
      responses: {
        [def.status ?? 200]: { description: 'Success. Body: `{ data, meta? }`' },
        400: { description: 'Validation failed' },
        ...((def.auth ?? this.authenticated) ? { 401: { description: 'Not signed in' }, 403: { description: 'Forbidden' } } : {}),
      },
    });
    return this;
  }
}

/* ---------- shared query helpers ---------- */

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

export const idParam = z.object({ id: z.string().uuid() });
