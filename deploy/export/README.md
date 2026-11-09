# Site package

A complete copy of one client site, as build output only: the API as a Docker image,
the built website, the database and uploaded files, and the settings.

## Install
Needs Docker with Docker Compose v2 (Linux) or Docker Desktop (Windows).

- **Linux:** `sudo ./install.sh`
- **Windows:** double-click `install.cmd`

The installer asks for a domain. With a domain it sets up HTTPS on ports 80/443 (point the
domain's DNS A record at the server first). Left empty, the site runs on this machine over
HTTP on a free port (8090 by default). At the end it prints the address, the sign-in and
the ports in use. Re-running it starts the site again with the same settings and data.

## Manage
In this folder (`<slug>` is `CELL_SLUG` in `.env`):
- status: `docker compose -p site-<slug> ps`
- logs: `docker compose -p site-<slug> logs -f api`
- stop: `docker compose -p site-<slug> down` (data is kept)

## Notes
- The database and files are restored on the first install only.
- `.env` holds this site's secrets. Keep it private and back it up; without
  `TENANT_SECRETS_KEY` the site's database cannot be opened.


## Backups

The installer schedules a nightly backup (03:30) of the database and the uploaded files into
`backups/<date-time>/` (Linux: cron; Windows: Task Scheduler) and keeps the newest 14
(`BACKUP_KEEP` in `.env`).

- Back up now: `./backup.sh` (Windows: `powershell -ExecutionPolicy Bypass -File backup.ps1`)
- Restore: `./restore.sh backups/<date-time>` (stops the site, replaces its data, starts it again)

Copy `backups/` to another machine from time to time: a backup on the same disk does not survive
a lost server.

## E-mail and SMS

Set in the installer, or later in the admin panel (Platform → Messaging) when the installer was
told to (`EMAIL_PROVIDER=panel`, `SMS_PROVIDER=panel`). Settings saved in the panel win over the
installer's.


## Site and admin address
The same domain and port serve both the website and the client's authenticated admin:
open <site-address>/admin to sign in. No second admin port is required, including behind a
tunnel or reverse proxy. The browser calls /api on its current origin. Set SITE_URL to the
public address used by visitors; CORS_ORIGINS can list additional allowed origins if needed.
The client admin edits content; the studio's full structural builder is not shipped.
