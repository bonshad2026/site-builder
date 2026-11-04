# One image definition for the whole monorepo; docker-compose picks a target.
#   api : Express API (runs migrations, seeds the demo once, then serves on 4000)
#   web : built React site served on 5173

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# Optional: fetch the locked packages from another registry (same versions and integrity hashes).
ARG NPM_REGISTRY=
RUN if [ -n "$NPM_REGISTRY" ]; then sed -i -E "s#https://[^\"/]+/repository/npm/#${NPM_REGISTRY}#g" package-lock.json; fi \
 && npm ci --no-audit --no-fund

FROM deps AS source
COPY . .

FROM source AS api
RUN npm run build -w packages/shared && npm run build -w apps/api
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "/app/docker/api-start.sh"]

# ---- Delivery builds: compiled and minified output only, no TypeScript source ----

FROM source AS api-build
RUN npm run build -w packages/shared && npm run build -w apps/api \
 && npx esbuild $(find apps/api/dist packages/shared/dist -name '*.js') --minify --platform=node --format=esm --outbase=. --outdir=. --allow-overwrite --log-level=warning \
 && find apps/api/dist packages/shared/dist \( -name '*.map' -o -name '*.d.ts' -o -name '*.tsbuildinfo' \) -delete \
 && npm prune --omit=dev --no-audit --no-fund

FROM node:22-alpine AS api-runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-build /app/package.json ./
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/packages/shared/package.json packages/shared/
COPY --from=api-build /app/packages/shared/dist packages/shared/dist
COPY --from=api-build /app/apps/api/package.json apps/api/
COPY --from=api-build /app/apps/api/dist apps/api/dist
COPY deploy/cell/api-start.sh deploy/cell/
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "/app/deploy/cell/api-start.sh"]

# Static site. The API origin is a placeholder, replaced with the real address when served.
FROM source AS web-static
ARG VITE_SITE_ID=atelier-navar
# VITE_ADMIN_SCOPE=client: the client's admin only; builder, pages and platform code are left out.
ENV VITE_API_URL=http://sb-site-url.invalid VITE_SITE_ID=$VITE_SITE_ID SITE_URL=http://sb-site-url.invalid VITE_ADMIN_SCOPE=client
RUN npm run build -w apps/web && find apps/web/dist -name '*.map' -delete

FROM source AS web
# Baked into the browser bundle: where the browser reaches the API.
ARG VITE_API_URL=http://localhost:4000
ARG VITE_SITE_ID=atelier-navar
ENV VITE_API_URL=$VITE_API_URL VITE_SITE_ID=$VITE_SITE_ID
RUN npm run build -w apps/web
WORKDIR /app/apps/web
EXPOSE 5173
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
