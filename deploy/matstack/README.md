# Cafe Matstack deployment

The installed cafe serves both its site and authenticated client admin on the same origin:
- Site: https://tunnel_5clqhcidslu.mattunnel.ir/fa
- Admin: https://tunnel_5clqhcidslu.mattunnel.ir/admin
- Loopback: http://localhost:8725 (site and /admin)
- Matstack target: http://127.0.0.1:8725
The old8727 admin mapping is retired. Public admin access was explicitly requested/approved
by the owner on2026-11-08. All API authentication/authorization remains enabled.

## Start or resume
Run from the repository root, with Docker Desktop running:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/start-local-site.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/start.ps1 -Check
# Start only if this site's agent is not already running:
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/start.ps1
```
Installation: exports/cafe-mohammad-20261106-0913/. Restarting reuses its image/data; it does
not bootstrap menu items or reconfigure the Instagram worker. See docs/clients/cafe-mohammad/operations.md.

## Configuration
Copy .env.example to ignored .env and store the dedicated tunnel key there. Never print/commit
keys. The shared executable is under ignored bin/; firefighter has a separate key/config.
The launcher checks the loopback TCP port and runs the agent in the foreground; Ctrl+C stops it.
It also accepts -ConfigPath for another site's configuration. Background launches use hidden
PowerShell and ignored logs/. Inspect the actual process before starting another agent; saved
launcher PID can identify the PowerShell parent rather than the agent. No auto-start service.
Client web must use same-origin API; CORS includes the public URL and same-port loopback URLs.
Caddy forwards /admin and authenticated API routes through the same listener as public pages.

## Download verification
Agent2.0.1, protocol2; --help supports --tunnel-key. Official Windows AMD64 file7,067,136 bytes.
SHA-256:5452F7EDACD9B2168DC6DB858174A0BA09D0E32D66EEB831CFB501C68DE3538D
(locally calculated, not a publisher-signed checksum). Liara remains independent/unchanged.
