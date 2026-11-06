# Local Matstack tunnel

Dedicated project directory: `deploy/matstack/`.

- Windows AMD64 agent: `bin/matstack-local-agent-windows-amd64.exe` (ignored by Git).
- Local secrets and executable path: `.env` (ignored by Git).
- Public address: https://tunnel_5clqhcidslu.mattunnel.ir
- Dashboard-configured local target: http://127.0.0.1:8725
- Official download: https://matstack.ir/downloads/local-agent/matstack-local-agent-windows-amd64.exe

The Windows agent was downloaded from the link published by the official tunnel page.
Only Windows AMD64 is required for this host; Linux/macOS agents are unnecessary.

From the repository root, after starting the isolated cafe site on port 8725:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/start.ps1 -Check
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/start.ps1
```

The script reads the key without printing it, checks that the configured loopback TCP port is
listening, and runs the agent in the foreground. Ctrl+C stops it. The destination is configured
in the Matstack dashboard; the script supplies only `--tunnel-key` to the agent. A successful
TCP check alone does not prove that the port serves the correct cafe: verify the isolated site
before starting the tunnel. Do not point this tunnel at the studio admin/preview stack.

The agent is not configured as a startup service. It is currently stopped at the owner's request.
See docs/clients/cafe-mohammad/operations.md before resuming.
Liara configuration is independent and unchanged. The local client package is described below.

## Download verification
- Agent reports version 2.0.1, protocol 2; --help confirms --tunnel-key.
- File size: 7,067,136 bytes (matches official server Content-Length).
- SHA-256: 5452F7EDACD9B2168DC6DB858174A0BA09D0E32D66EEB831CFB501C68DE3538D
  (locally calculated, not a publisher-signed checksum).


## Installed cafe (currently stopped), 2026-11-06

- Install package: exports/cafe-mohammad-20261106-0913/; copy of archive also under this repo's exports.
- Containers/volumes use compose project site-cafe-mohammad, independent from studio and Liara.
- Start/restart site: powershell -File deploy/matstack/start-local-site.ps1
- Start foreground tunnel: powershell -File deploy/matstack/start.ps1
- The previous background agent was stopped. logs/agent.pid may be stale; inspect the actual
  process before starting another. Logs are in ignored logs/agent.err.log.
- Public origin is HTTPS; Caddy listens only on host loopback 8725 and forwards HTTPS scheme to API.
- Caddy blocks studio/operator admin and private API routes on this public cafe origin. Public
  pages, assets, customer APIs and request forms remain served. No public admin login is exposed.
- SMS is panel-configured and enabled with verifycode. No real SMS test was sent; its provider
  template still needs the opt-out footer. Email delivery has not been verified.
- Website/API public responses and visible menu/images were verified. No Android runtime test yet.

## Instagram order worker and local owner panel

The installed cafe now uses orderMode=instagram. See docs/guide/instagram-orders.md.
The owner panel is http://localhost:8727/admin, loopback only; public :8725 still blocks private routes.
start-local-site.ps1 includes admin.compose.yml. Client JavaScript uses same-origin API requests.
The existing APK loads this updated site without requiring another APK build.
