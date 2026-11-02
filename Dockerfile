# Self-hosted Dumb Tasks: the built app as static files, served by nginx. WebDAV sync only:
# Google Drive sync is off, as it needs the sign-in Worker, which runs on Cloudflare.

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Shown in the sync menu, to tell which version a device runs (there's no .git in here)
ARG COMMIT_SHA=unknown
RUN VITE_GOOGLE_CLIENT_ID= COMMIT_SHA=$COMMIT_SHA npm run build

FROM nginx:1.28-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/client /usr/share/nginx/html
EXPOSE 80
