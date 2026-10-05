# Готовый образ: сервер и веб-версия уже собраны, ничего не компилируется.
FROM node:22-slim
ENV NODE_ENV=production TZ=Europe/Moscow PORT=3000 DB_FILE=/data/sdelka.db WEB_DIR=/srv/web
WORKDIR /srv
COPY app/ ./
VOLUME /data
EXPOSE 3000
CMD ["node", "--no-warnings=ExperimentalWarning", "src/main.ts"]
