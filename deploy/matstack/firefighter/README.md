# Firefighter Matstack tunnel

Separate configuration for the installed firefighter package. Reuses the verified Windows agent
binary at ../bin/, with its own ignored .env and logs. Never copy the cafe tunnel key here.

- Public: https://tunnel_ikwlc5hk4ly.mattunnel.ir
- Matstack dashboard target: http://127.0.0.1:8735
- Local private owner panel: http://localhost:8737/admin
- Studio builder remains http://admin.localhost/admin/sites/firefighter/pages

From repository root:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/firefighter/start-local-site.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/firefighter/start.ps1 -Check
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/firefighter/start.ps1
```

The first script preserves existing package data, sets the public origin and production panel
messaging adapters, and includes the private loopback admin mapping. It does not install a new API
image or apply a design update. Public Caddy blocks /admin and private staff/auth/platform APIs;
customer APIs and files remain available. Panel credentials remain in the ignored package .env.
Messaging providers must be configured for real OTP/delivery; production does not expose dev codes.

Current agent started hidden on 2026-11-07. logs/launcher.pid records the PowerShell parent, not
necessarily the child agent. Inspect parent/child identity before stopping this tunnel; do not kill
all Matstack processes since the cafe has a separate agent. The wrapper accepts its .env through
../start.ps1 -ConfigPath, retaining the original default configuration for the cafe.
No Windows startup service or automatic restart was configured.
