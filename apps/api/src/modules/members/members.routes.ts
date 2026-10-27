import { PERMISSIONS, staffInviteSchema } from '@site-builder/shared';
import { z } from 'zod';
import { badRequest, notFound } from '../../common/errors.js';
import { ApiRouter } from '../../common/http.js';
import type { AppContext } from '../../context.js';
import { requireOwner } from '../../middleware/tenant.js';
import { auditPlatform } from '../audit/audit.js';
import { createUser, requestPasswordReset } from '../auth/auth.service.js';

const userParam = z.object({ userId: z.string().uuid() });

/** Site owners manage their own staff. Memberships live in the control plane. */
export function membersRoutes(ctx: AppContext) {
  const r = new ApiRouter('/api/v1/sites/:siteId/members', 'Members', true);
  r.router.use(requireOwner);

  r.route({ method: 'get', path: '/', summary: 'List owner and staff' }, async ({ req }) => {
    const { rows } = await ctx.control.query(
      `SELECT u.id AS "userId", u.email, u.display_name AS "displayName", m.role, m.permissions, m.created_at AS "addedAt"
         FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = $1 ORDER BY m.role, u.email`,
      [req.tenant!.id],
    );
    return { data: rows };
  });

  r.route({ method: 'post', path: '/', summary: 'Add a staff member', status: 201, body: staffInviteSchema }, async ({ req, body }) => {
    let user = (await ctx.control.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [body.email])).rows[0];
    const invited = !user;
    if (!user) user = await createUser(ctx, { email: body.email });
    const { rows } = await ctx.control.query(
      `INSERT INTO memberships (user_id, tenant_id, role, permissions) VALUES ($1, $2, 'staff', $3)
       ON CONFLICT (user_id, tenant_id) DO NOTHING RETURNING user_id`,
      [user.id, req.tenant!.id, body.permissions],
    );
    if (!rows[0]) throw badRequest('This person is already a member of the site');
    if (invited) await requestPasswordReset(ctx, body.email);
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, tenantId: req.tenant!.id, action: 'member.added', target: body.email, metadata: { permissions: body.permissions } });
    return { data: { userId: user.id, email: body.email, role: 'staff', permissions: body.permissions, invited } };
  });

  r.route(
    { method: 'patch', path: '/:userId', summary: 'Change a staff member’s permissions', params: userParam, body: z.object({ permissions: z.array(z.enum(PERMISSIONS)) }) },
    async ({ req, params, body }) => {
      const { rowCount } = await ctx.control.query(`UPDATE memberships SET permissions = $3 WHERE tenant_id = $1 AND user_id = $2 AND role = 'staff'`, [
        req.tenant!.id,
        params.userId,
        body.permissions,
      ]);
      if (!rowCount) throw notFound('Staff member');
      await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, tenantId: req.tenant!.id, action: 'member.updated', target: params.userId, metadata: body });
      return { data: { userId: params.userId, permissions: body.permissions } };
    },
  );

  r.route({ method: 'delete', path: '/:userId', summary: 'Remove a staff member', params: userParam }, async ({ req, params }) => {
    const { rowCount } = await ctx.control.query(`DELETE FROM memberships WHERE tenant_id = $1 AND user_id = $2 AND role = 'staff'`, [req.tenant!.id, params.userId]);
    if (!rowCount) throw notFound('Staff member');
    await auditPlatform(ctx.control, { actorUserId: req.auth!.user.id, tenantId: req.tenant!.id, action: 'member.removed', target: params.userId });
  });

  return r.router;
}
