import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { TEST_MODE, testProviders } from './providers.ts';
import { advanceDemo, seedDemo } from './seed.ts';

const port = Number(process.env.PORT ?? 3000);
const managerKey = process.env.MANAGER_KEY ?? 'demo-manager';
const db = openDb(process.env.DB_FILE ?? 'sdelka.db');

if (!TEST_MODE) throw new Error('Реальные провайдеры ещё не подключены: запускайте с PROVIDERS_MODE=test');

const { app, deals } = buildApp({ db, providers: testProviders, managerKey, logger: true });
if (process.env.SEED !== 'off') {
  seedDemo(deals);
  await advanceDemo(deals);
}
await app.listen({ port, host: '0.0.0.0' });
