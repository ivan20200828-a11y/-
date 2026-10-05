#!/bin/sh
# Запуск «Сделки онлайн» на этом компьютере: приложение откроется по адресу http://localhost:3000
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Не найден Node.js. Установите версию 22 или новее с https://nodejs.org и запустите снова."; exit 1
fi
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)"; then
  echo "Нужен Node.js 22.18 или новее, сейчас $(node -v). Обновите его с https://nodejs.org"; exit 1
fi
mkdir -p data
PORT="${PORT:-3000}"
( sleep 3; URL="http://localhost:$PORT"; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") ) >/dev/null 2>&1 &
cd app && WEB_DIR="$PWD/web" DB_FILE="../data/sdelka.db" TZ="${TZ:-Europe/Moscow}" PORT="$PORT" \
  exec node --no-warnings=ExperimentalWarning --env-file-if-exists=../settings.env src/main.ts
