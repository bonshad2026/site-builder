# Firefighter Matstack deployment

Site and authenticated client admin share one origin and port:
- Site: https://tunnel_ikwlc5hk4ly.mattunnel.ir/fa
- Admin: https://tunnel_ikwlc5hk4ly.mattunnel.ir/admin
- Loopback: http://localhost:8735 (site and /admin)
- Matstack target: http://127.0.0.1:8735
The former8737 private admin mapping is retired. Owner explicitly approved public /admin
access on2026-11-08; API authentication/authorization and client scope remain in effect.
Studio builder: http://admin.localhost/admin/sites/firefighter/pages (independent tenant).

From repository root:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/firefighter/start-local-site.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/firefighter/start.ps1 -Check
# Only if this site's agent is not already running:
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/matstack/firefighter/start.ps1
```
The site script preserves data/image, sets production panel messaging and same-port CORS origins.
It copies the single-listener Caddy config and uses the package's primary compose file only.
Client web uses same-origin API. Panel credentials remain in the ignored package .env.
Messaging still needs provider settings; production does not expose development OTPs.

Tunnel configuration/logs are separate from cafe, with the verified shared binary in ../bin/.
Never copy cafe's key here. Start wrapper calls ../start.ps1 with this site's ConfigPath.
Hidden launcher's logs/launcher.pid can name the parent; inspect processes before stopping or
starting agents. No automatic Windows startup service was configured. Never stop all agents
for a change to a single site.
