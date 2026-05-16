# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Build-time env: prod-сборка Vite инлайнит VITE_* переменные
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID=self-hosted
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

COPY package.json bun.lockb* package-lock.json* ./
RUN if [ -f bun.lockb ]; then npm i -g bun && bun install --frozen-lockfile; \
    else npm ci; fi

COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Шаблон nginx-конфига; на старте подставляем SUPABASE_HOST через envsubst.
COPY backend/deploy/nginx.conf /etc/nginx/templates/default.conf.template
# По-умолчанию: тот же self-hosted Supabase, что и в build-time.
# Можно переопределить через docker run -e SUPABASE_HOST=...
ENV SUPABASE_HOST=""
EXPOSE 80
# nginx:alpine из коробки умеет /etc/nginx/templates/*.template + envsubst.
CMD ["nginx", "-g", "daemon off;"]
