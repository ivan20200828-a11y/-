import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { buildApp } from '../src/app.ts';
import { BackupService } from '../src/backup.ts';
import { openDb } from '../src/db.ts';
import { testProviders } from '../src/providers.ts';

test('one database copy a day, old ones removed', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sdelka-backup-'));
  const db = openDb(':memory:');
  db.exec(`CREATE TABLE probe (x TEXT); INSERT INTO probe VALUES ('saved');`);
  const b = new BackupService(db, dir, 2);
  for (const day of ['2026-10-01', '2026-10-02']) writeFileSync(path.join(dir, `sdelka-${day}.db`), '');
  assert.equal(b.daily(new Date('2026-10-05T12:00:00+03:00')), 'sdelka-2026-10-05.db');
  assert.equal(b.daily(new Date('2026-10-05T18:00:00+03:00')), null, 'only once a day');
  assert.deepEqual(b.list(), ['sdelka-2026-10-02.db', 'sdelka-2026-10-05.db']);
  const copy = new DatabaseSync(path.join(dir, 'sdelka-2026-10-05.db'));
  assert.deepEqual({ ...copy.prepare('SELECT x FROM probe').get() }, { x: 'saved' });
});

test('only an administrator downloads a copy of the database', async () => {
  const { app, auth } = buildApp({ db: openDb(':memory:'), providers: testProviders });
  auth.addManager('admin@test.ru', 'Админ', 'secret-pass', true);
  auth.addManager('anna@test.ru', 'Анна', 'secret-pass', false);
  const login = async (email: string) =>
    ({ authorization: `Bearer ${(await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'secret-pass' } })).json().token}` });
  const keyFor = async (h: Record<string, string>) => (await app.inject({ method: 'POST', url: '/api/export/key', headers: h })).json().key;

  const anna = await keyFor(await login('anna@test.ru'));
  assert.equal((await app.inject({ url: `/api/export/backup.db?key=${anna}` })).statusCode, 403);
  const admin = await keyFor(await login('admin@test.ru'));
  const res = await app.inject({ url: `/api/export/backup.db?key=${admin}` });
  assert.equal(res.statusCode, 200);
  assert.equal(res.rawPayload.subarray(0, 15).toString(), 'SQLite format 3');
});
