import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { TEST_MODE, providersFromEnv } from './providers.ts';
import { advanceDemo, seedDemo } from './seed.ts';

const port = Number(process.env.PORT ?? 3000);
const db = openDb(process.env.DB_FILE ?? 'sdelka.db');

if (!TEST_MODE) throw new Error('Реальные SMS и проверка паспорта ещё не подключены: запускайте с PROVIDERS_MODE=test');

const { app, deals, auth } = buildApp({ db, providers: providersFromEnv(), logger: true, appUrl: process.env.APP_URL, webDir: process.env.WEB_DIR });

// First start: create the first manager account from the environment, or a demo one.
if (!auth.hasManagers()) {
  const email = process.env.ADMIN_EMAIL ?? 'manager@demo.ru';
  const password = process.env.ADMIN_PASSWORD ?? 'demo1234';
  auth.addManager(email, process.env.ADMIN_NAME ?? 'Менеджер', password);
  app.log.info(`Создан менеджер ${email}`);
}
if (process.env.SEED !== 'off') {
  seedDemo(deals);
  await advanceDemo(deals);
}
await app.listen({ port, host: '0.0.0.0' });

// Payment reminders by SMS: on start and then every hour.
const remind = () => deals.sendReminders().then(
  (sent) => sent.length && app.log.info(`Напоминаний о платежах отправлено: ${sent.length}`),
  (e) => app.log.error(e),
);
await remind();
setInterval(remind, 60 * 60 * 1000).unref();
