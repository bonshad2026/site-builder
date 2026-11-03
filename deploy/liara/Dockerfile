# One client site as a single Liara Docker app: Caddy serves the built site on port 80 and
# proxies the API (port 4000, same container). The database is a Liara PostgreSQL service.
# Build context = the `liara/` folder of an install package (build output only, no source).
FROM node:22-alpine
ENV NODE_ENV=production XDG_DATA_HOME=/tmp/caddy XDG_CONFIG_HOME=/tmp/caddy
COPY caddy /usr/bin/caddy
COPY app /app
COPY site /site
COPY Caddyfile /etc/caddy/Caddyfile
COPY data /restore
COPY start.mjs /start.mjs
WORKDIR /app/apps/api
EXPOSE 80
CMD ["node", "/start.mjs"]
