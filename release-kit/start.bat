@echo off
rem Запуск «Сделки онлайн» на этом компьютере: приложение откроется по адресу http://localhost:3000
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Не найден Node.js. Установите версию 22 или новее с https://nodejs.org и запустите снова. & pause & exit /b 1)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)" || (echo Нужен Node.js 22.18 или новее. Обновите его с https://nodejs.org & pause & exit /b 1)
if not exist data mkdir data
if "%PORT%"=="" set PORT=3000
set TZ=Europe/Moscow
set WEB_DIR=%~dp0app\web
set DB_FILE=%~dp0data\sdelka.db
start "" /b powershell -NoProfile -Command "Start-Sleep 3; Start-Process 'http://localhost:%PORT%'"
cd app
node --no-warnings=ExperimentalWarning --env-file-if-exists=..\settings.env src\main.ts
pause
