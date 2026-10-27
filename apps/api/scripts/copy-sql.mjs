// tsc does not copy .sql migration files; mirror them into dist.
import { cpSync } from 'node:fs';
for (const dir of ['database/control-plane/migrations', 'database/tenant/migrations']) {
  cpSync(`src/${dir}`, `dist/${dir}`, { recursive: true });
}
