# Cafe operations — current handoff

Updated 2026-11-06. All project services and the Matstack agent were intentionally stopped at
the owner's request. No containers, volumes or site data were removed. Restart only when asked.

## Resume from repository root

Docker Desktop must be running. These commands reuse the existing installation and secrets;
do not rerun bootstrap/menu scripts or worker setup, which are not restart commands.

```powershell
# Optional studio, for operator design/content work.
docker compose -f deploy/docker-compose.yml up -d

# Installed cafe, including the private local owner panel.
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/start-local-site.ps1

# Existing worker credentials/role, no test DM or fresh probe login.
docker compose -f deploy/instagram-relay/worker.compose.yml up -d

# Start only after cafe origin is available. This runs in the foreground.
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/start.ps1 -Check
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/start.ps1
```

The test database is only needed for API tests: `docker start sb-test-pg`.
Check actual Matstack processes before launching; the old ignored agent.pid may be stale.
Do not print local .env, worker .worker.env or encrypted messaging secrets.
No startup service or automatic next-day restart was configured.

## Addresses and installation

- Package: `exports/cafe-mohammad-20261106-0913/`; compose project `site-cafe-mohammad`.
- Local cafe: http://127.0.0.1:8725/fa; private panel: http://localhost:8727/admin.
- Public cafe: https://tunnel_5clqhcidslu.mattunnel.ir (offline while stopped).
- Owner login: `owner` / `123456` (local development account).
- Studio: http://admin.localhost/admin, operator `admin` / `123456` (local only).
- Latest debug APK: `/downloads/cafe-mohammad-0.4.0.apk` on cafe origin. It is already built;
  ordinary web design updates do not require rebuilding it. Phone inset fix awaits owner testing.
- Liara deployment was not changed. Keep this install separate from the studio.

## Current features and manual editing

- Header settings: drawer/bottom mobile navigation; up to four localized icon links plus More.
- Shop page settings: category rows; Products sections: compact horizontal layout.
- Existing built-in Cart page: compact cards, quantity controls and summary.
- Home Stats section: square icon cards; existing text preserved.
- Shared mobile offsets reduced for bottom navigation. Add button status reflects real cart count.
- Shop sender panel: credentials, connect/code entry/status. Durable order outbox feeds worker.
- Orders: authenticated live updates, inline stage/manual payment, quick preview and walk-in POS.
- Cafe catalog prices were filled by owner. Do not rerun early catalog generation scripts over them.

## Open items and evidence

- SMS is enabled with Kavenegar verifycode. Signup remains phone/password without mandatory OTP.
  Append a new final line `لغو ۱۱` in the provider template; code did not change the remote template
  because its fallback delivery policy could not be preserved from the API response.
- Latest web typecheck/build succeeded. Last full API: 123 passed. Last full web: 50 passed,
  4 pre-existing failures (54). Three subsequent focused tests passed; full 57-test suite not rerun.
- Owner performs visual acceptance of recent UI changes and APK 0.4.0 on their own phone.
- Branch `feature/local-matstack`; all recent work uncommitted. No push/merge requested.
- Routine shutdown uses `docker stop` and stopping the project Matstack process; never remove
  volumes or run bootstrap scripts as part of shutdown/restart.
