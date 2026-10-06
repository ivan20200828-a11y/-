import path from 'node:path';

import { BackupService } from './backup.ts';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
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
const { app, deals, auth } = buildApp({ db, providers, logger: true, appUrl: process.env.APP_URL ?? `http://localhost:${port}`, backups, trustProxy: process.env.TRUST_PROXY === '1', webDir: process.env.WEB_DIR });

// First start: create the first manager account from the environment, or a demo one.
if (!auth.hasManagers()) {
  const email = process.env.ADMIN_EMAIL ?? 'manager@demo.ru';
  const password = process.env.ADMIN_PASSWORD ?? 'demo1234';
  auth.addManager(email, process.env.ADMIN_NAME ?? 'Менеджер', password, true);
  app.log.info(`Создан менеджер ${email}`);
}
if (process.env.SEED !== 'off') {
  seedDemo(deals);
  await advanceDemo(deals);
}
await app.listen({ port, host: '0.0.0.0' });
const test = testParts(providers);
if (test.length) app.log.warn(`В тестовом режиме: ${test.join(', ')}`);

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
