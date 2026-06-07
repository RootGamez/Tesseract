# ─── Stage 1: build del SPA (Vite/React) ─────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Las URLs públicas se hornean en el bundle (Vite usa import.meta.env.*).
# Se inyectan como build args desde docker-compose (.env.prod).
ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Stage 2: servidor de estáticos (Caddy, sólo file server) ─────────────────
# Caddy escucha en :80 en claro (sin auto-TLS). La terminación TLS y el ruteo
# por dominio los hace Nginx Proxy Manager por delante.
FROM caddy:2-alpine

COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80
