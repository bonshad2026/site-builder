import type { MembershipRole, ModuleId, Permission } from '@site-builder/shared';
import type pg from 'pg';

export interface SessionUser {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  isPlatformAdmin: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface AuthState {
  user: SessionUser;
  sessionId: string;
  csrfHash: string;
}

export interface TenantContext {
  id: string;
  slug: string;
  name: string;
  db: pg.Pool;
  /** Null on public (visitor) requests. */
  role: MembershipRole | 'platform_admin' | null;
  permissions: ReadonlySet<Permission>;
  modules?: Partial<Record<ModuleId, boolean>>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthState;
      tenant?: TenantContext;
    }
  }
}
