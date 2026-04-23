FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build:web

FROM caddy:2-alpine
COPY deploy/Caddyfile.app /etc/caddy/Caddyfile
COPY --from=builder /app/dist /srv
EXPOSE 8080
