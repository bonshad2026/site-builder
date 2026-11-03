# Site on Liara

One client site as a single Liara **Docker app** (Caddy on port 80 serving the built site and
proxying the API on port 4000) plus a Liara **PostgreSQL** service. Liara serves HTTPS and the domain.
Built by "استقرار روی لیارا" on the deploy page; this folder is the build context Liara builds.

## Once, in the Liara console
1. A private network (e.g. `sites`).
2. A PostgreSQL 16 service in that network, public access off. One server can hold several sites
   (each gets `sb_control_<slug>` and `sb_t_<slug>`). Its admin user must be a superuser.
3. Per site: a Docker app in the same network, and a disk named `uploads` on it.
4. An API token (console → API).

## Studio settings (`deploy/.env`, then rebuild `control`)
```
LIARA_API_TOKEN=      # console → API
LIARA_TEAM_ID=        # only for a team account
LIARA_DB_HOST=        # the PostgreSQL service id (private network host name)
LIARA_DB_PORT=5432
LIARA_DB_USER=root
LIARA_DB_PASSWORD=
```

## What a deploy does
1. Builds an install package (with a `liara/` folder) like "بسته‌ی نصب کامل".
2. `liara env set`: the site's secrets, `SITE_URL`, and `DB_*` for the database server.
3. `liara deploy --platform docker --port 80 --disks uploads=/data/uploads`.

On the app's first start `start.mjs` creates the databases and accounts, unpacks the uploaded files
onto the disk and loads the site's rows (`data/site.sql`); a marker on the disk
(`.site-data-loaded`) keeps later starts and deploys from loading them again, so the client's data
stays. Later deploys bring a new API and built site; page designs in the database are not replaced.

## By hand
With the Liara CLI (`npm i -g @liara/cli`), in this folder:
```
liara env set KEY=value ... --app <app>
liara deploy --app <app> --platform docker --port 80 --disks uploads=/data/uploads
```
