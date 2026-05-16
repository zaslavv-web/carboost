# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Build-time env: prod-сборка Vite инлайнит VITE_* переменные.
# Phase 13: фронт ходит ТОЛЬКО на Laravel-бэкенд по тому же домену.
# По-умолчанию используется относительный путь /api, который
# проксируется nginx'ом в Laravel (LARAVEL_HOST).
ARG VITE_LARAVEL_API_URL=/api
ARG VITE_REVERB_KEY=""
ARG VITE_REVERB_HOST=""
ARG VITE_REVERB_PORT=443
ARG VITE_REVERB_SCHEME=https
ENV VITE_LARAVEL_API_URL=$VITE_LARAVEL_API_URL
ENV VITE_REVERB_KEY=$VITE_REVERB_KEY
ENV VITE_REVERB_HOST=$VITE_REVERB_HOST
ENV VITE_REVERB_PORT=$VITE_REVERB_PORT
ENV VITE_REVERB_SCHEME=$VITE_REVERB_SCHEME

COPY package.json bun.lockb* package-lock.json* ./
RUN if [ -f bun.lockb ]; then npm i -g bun && bun install --frozen-lockfile; \
    else npm ci; fi

COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Шаблон nginx-конфига; на старте подставляется LARAVEL_HOST через envsubst.
COPY backend/deploy/nginx.conf /etc/nginx/templates/default.conf.template
# По-умолчанию ходим в сервис `app` из docker-compose-сети.
# Переопределяется через docker run -e LARAVEL_HOST=host:port
ENV LARAVEL_HOST="app:9000"
EXPOSE 80
# nginx:alpine из коробки умеет /etc/nginx/templates/*.template + envsubst.
CMD ["nginx", "-g", "daemon off;"]
