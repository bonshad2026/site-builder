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
