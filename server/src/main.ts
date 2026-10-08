import path from 'node:path';

import { BackupService } from './backup.ts';
import { lanAddresses, qrTerminal } from './connect.ts';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { KNOWN_PASSWORDS } from './auth.ts';
import { providersFromEnv, testParts } from './providers.ts';
import { advanceDemo, seedDemo } from './seed.ts';

const port = Number(process.env.PORT ?? 3000);
const dbFile = process.env.DB_FILE ?? 'sdelka.db';
const db = openDb(dbFile);
// A copy of the database every day, the last BACKUP_KEEP (14) kept; BACKUP_DIR=off turns it off.
const backups = process.env.BACKUP_DIR === 'off'
  ? undefined
  : new BackupService(db, process.env.BACKUP_DIR ?? path.join(path.dirname(path.resolve(dbFile)), 'backups'), Number(process.env.BACKUP_KEEP ?? 14));

const providers = providersFromEnv();
// A working server: clients reach it by a real https address. Demo accounts and demo deals are not allowed there.
const appUrl = process.env.APP_URL ?? '';
const live = /^https:\/\//.test(appUrl) && !/\/\/(localhost|127\.0\.0\.1)\b/.test(appUrl);
// Phones connect by the working address, or on a computer by its address in the office Wi-Fi.
const phoneUrls = () => (live ? [appUrl.replace(/\/+$/, '')] : lanAddresses(port));

const { app, deals, auth } = buildApp({ phoneUrls, db, providers, logger: true, appUrl: process.env.APP_URL ?? `http://localhost:${port}`, backups, trustProxy: process.env.TRUST_PROXY === '1', webDir: process.env.WEB_DIR });

// First start: create the first manager account from the environment, or a demo one on a computer.
if (!auth.hasManagers()) {
  const email = process.env.ADMIN_EMAIL ?? 'manager@demo.ru';
  const password = process.env.ADMIN_PASSWORD ?? 'demo1234';
  if (live && (KNOWN_PASSWORDS.includes(password) || email === 'manager@demo.ru')) {
    app.log.fatal('На сервере нужен свой администратор: впишите в settings.env ADMIN_EMAIL и ADMIN_PASSWORD (не demo1234) и запустите снова.');
    process.exit(1);
  }
  try {
    auth.addManager(email, process.env.ADMIN_NAME ?? 'Менеджер', password, true);
  } catch (e) {
    app.log.fatal(`Не получилось создать администратора из settings.env: ${(e as Error).message}. Исправьте ADMIN_EMAIL или ADMIN_PASSWORD и запустите снова.`);
    process.exit(1);
  }
  app.log.info(`Создан менеджер ${email}`);
}
// Demo deals open by a known code, so a working server never has them.
if (!live && process.env.SEED !== 'off') {
  seedDemo(deals);
  await advanceDemo(deals);
}
await app.listen({ port, host: '0.0.0.0' });
// On a computer: where to open the app, and a code the phone app scans to connect («Подключить по QR-коду»).
if (!live) {
  const [phone, ...other] = lanAddresses(port);
  console.log(`\nСделка онлайн запущена. На этом компьютере: http://localhost:${port}`);
  if (phone) {
    console.log(`С телефона в той же сети Wi-Fi: ${phone}${other.length ? ` (или ${other.join(', ')})` : ''}`);
    console.log('Чтобы подключить приложение, нажмите в нём «Подключить по QR-коду» и наведите камеру на код:\n');
    console.log(await qrTerminal(phone));
  }
}
const test = testParts(providers);
if (test.length) app.log.warn(`В тестовом режиме: ${test.join(', ')}`);
if (live) {
  const known = (db.prepare('SELECT id, email FROM managers WHERE disabled = 0').all() as { id: number; email: string }[])
    .filter((m) => auth.hasKnownPassword(m.id));
  for (const m of known) app.log.warn(`У ${m.email} пароль из инструкции. Смените его в приложении: Сделки → Сменить пароль.`);
}

// Payment reminders by SMS; errors are logged, the next run tries again.
const remind = () => deals.sendReminders().then(
  (sent) => sent.length && app.log.info(`Напоминаний о платежах отправлено: ${sent.length}`),
  (e) => app.log.error(e),
);
// Hourly: payment reminders by SMS, and the day's database copy once the date changes.
const hourly = async () => {
  await remind();
  try {
    const made = backups?.daily();
    if (made) app.log.info(`Резервная копия базы: ${path.join(backups!.dir, made)}`);
  } catch (e) {
    app.log.error(e, 'Не получилось сделать резервную копию базы');
  }
};
await hourly();
setInterval(hourly, 60 * 60 * 1000).unref();
