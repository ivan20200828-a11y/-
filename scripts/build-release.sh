#!/bin/sh
# Собирает готовый пакет release/sdelka-online.zip: сервер с зависимостями, веб-версию, скрипты запуска и инструкцию.
set -e
cd "$(dirname "$0")/.."
OUT=release/sdelka-online
rm -rf release && mkdir -p "$OUT/app"
EXPO_PUBLIC_API_URL= npx expo export -p web --output-dir "$OUT/app/web"
cp server/package.json server/package-lock.json "$OUT/app/"
cp -r server/src "$OUT/app/src"
(cd "$OUT/app" && npm ci --omit=dev --no-audit --no-fund)
cp release-kit/start.sh release-kit/start.command release-kit/start.bat release-kit/settings.env \
   release-kit/Dockerfile release-kit/docker-compose.yml release-kit/Caddyfile release-kit/ИНСТРУКЦИЯ.html "$OUT/"
chmod +x "$OUT/start.sh" "$OUT/start.command"
(cd release && zip -qr -X sdelka-online.zip sdelka-online)
echo "Готово: release/sdelka-online.zip"
