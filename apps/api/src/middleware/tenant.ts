import { PERMISSIONS, type ModuleId, type Permission } from '@site-builder/shared';
import type { RequestHandler } from 'express';
import { AppError, forbidden, notFound, unauthorized } from '../common/errors.js';
import type { AppContext } from '../context.js';
import type { TenantContext } from '../types.js';

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  db_name: string;
  db_user: string;
  db_password_enc: string | null;
}

async function findActiveTenant(ctx: AppContext, slug: string): Promise<TenantRow | null> {
  const { rows } = await ctx.control.query<TenantRow>(
    `SELECT id, slug, name, status, db_name, db_user, db_password_enc FROM tenants WHERE slug = $1`,
    [slug],
  );
  const t = rows[0];
  return t && t.status === 'active' && t.db_password_enc ? t : null;
}

function poolFor(ctx: AppContext, t: TenantRow) {
  return ctx.tenantPools.get({ id: t.id, dbName: t.db_name, dbUser: t.db_user, dbPasswordEnc: t.db_password_enc! });
}

/**
 * Admin routes: /sites/:siteId/...  The site is taken from the URL, but access is
 * granted only from the signed-in user's membership in the control plane, never
 * from anything the browser claims. Non-members get 404 so sites cannot be probed.
 */
export function loadMemberTenant(ctx: AppContext): RequestHandler {
  return async (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    const slug = String(req.params.siteId ?? '');
    const tenant = await findActiveTenant(ctx, slug);
    if (!tenant) return next(notFound('Site'));

    let role: TenantContext['role'] = null;
    let permissions = new Set<Permission>();
    if (req.auth.user.isPlatformAdmin) {
      role = 'platform_admin';
      permissions = new Set(PERMISSIONS);
    } else {
      const { rows } = await ctx.control.query<{ role: 'owner' | 'staff'; permissions: string[] }>(
        'SELECT role, permissions FROM memberships WHERE tenant_id = $1 AND user_id = $2',
        [tenant.id, req.auth.user.id],
      );
      const membership = rows[0];
      if (!membership) return next(notFound('Site'));
      role = membership.role;
      permissions =
        membership.role === 'owner'
          ? new Set(PERMISSIONS)
          : new Set(membership.permissions.filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p)));
    }

    req.tenant = { id: tenant.id, slug: tenant.slug, name: tenant.name, db: poolFor(ctx, tenant), role, permissions };
    next();
  };
}

/** Public visitor routes: /public/sites/:siteSlug/...  Only active sites, read-only published data. */
export function loadPublicTenant(ctx: AppContext): RequestHandler {
  return async (req, _res, next) => {
    const tenant = await findActiveTenant(ctx, String(req.params.siteSlug ?? ''));
    if (!tenant) return next(notFound('Site'));
    req.tenant = { id: tenant.id, slug: tenant.slug, name: tenant.name, db: poolFor(ctx, tenant), role: null, permissions: new Set() };
    next();
  };
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.tenant?.permissions.has(permission)) return next(forbidden(`Requires permission ${permission}`));
    next();
  };
}

export const requireOwner: RequestHandler = (req, _res, next) => {
  if (req.tenant?.role !== 'owner' && req.tenant?.role !== 'platform_admin') return next(forbidden('Only the site owner can do this'));
  next();
};

/**
 * Rejects requests to a module the site has switched off, on admin and public
 * routes alike. Hiding the UI alone is not enough.
 */
export function requireModule(module: ModuleId): RequestHandler {
  return async (req, _res, next) => {
    const tenant = req.tenant;
    if (!tenant) return next(notFound('Site'));
    if (!tenant.modules) {
      const { rows } = await tenant.db.query<{ modules: Partial<Record<ModuleId, boolean>> }>(
        `SELECT settings->'modules' AS modules FROM site_settings WHERE id = 1`,
      );
      tenant.modules = rows[0]?.modules ?? {};
    }
    if (!tenant.modules[module]) return next(new AppError(403, 'module_disabled', `The ${module} module is not enabled for this site`));
    next();
  };
}
