# One image definition for the whole monorepo; docker-compose picks a target.
#   api : Express API (runs migrations, seeds the demo once, then serves on 4000)
#   web : built React site served on 5173

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --no-audit --no-fund

FROM deps AS source
COPY . .

FROM source AS api
RUN npm run build -w packages/shared && npm run build -w apps/api
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "/app/docker/api-start.sh"]

FROM source AS web
# Baked into the browser bundle: where the browser reaches the API.
ARG VITE_API_URL=http://localhost:4000
ARG VITE_SITE_ID=atelier-navar
ENV VITE_API_URL=$VITE_API_URL VITE_SITE_ID=$VITE_SITE_ID
RUN npm run build -w apps/web
WORKDIR /app/apps/web
EXPOSE 5173
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
