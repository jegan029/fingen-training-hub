# ── Build ────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Bundle only: type checking and tests run in CI (a unit test reads the backend dataset,
# which is outside this build context).
RUN npx vite build

# ── Serve ────────────────────────────────────────────────
# nginx-unprivileged runs as a non-root user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
