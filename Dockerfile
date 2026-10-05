# Сервер и веб-версия приложения в одном контейнере: https://<адрес>/ — приложение, /api — сервер.

FROM node:22-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Пустой адрес API: веб-приложение обращается к серверу по тому же адресу, с которого открыто.
ENV EXPO_PUBLIC_API_URL=
RUN npx expo export -p web --output-dir /web

FROM node:22-slim
ENV NODE_ENV=production TZ=Europe/Moscow PORT=3000 DB_FILE=/data/sdelka.db WEB_DIR=/srv/web
WORKDIR /srv
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY --from=web /web ./web
VOLUME /data
EXPOSE 3000
CMD ["node", "--no-warnings=ExperimentalWarning", "src/main.ts"]
