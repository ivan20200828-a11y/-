import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildApp } from '../src/app.ts';
import { openDb } from '../src/db.ts';
import { testProviders } from '../src/providers.ts';

async function setup() {
  const { app, auth } = buildApp({ db: openDb(':memory:'), providers: testProviders });
  const admin = auth.addManager('admin@test.ru', 'Админ', 'admin-pass-1', true);
  const anna = auth.addManager('anna@test.ru', 'Анна', 'anna-pass-1', false);
  const login = (email: string, password: string) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
  const headers = async (email: string, password: string) => ({ authorization: `Bearer ${(await login(email, password)).json().token}` });
  return { app, admin, anna, login, headers };
}

test('a manager changes their own password; other sessions end', async () => {
  const { app, login, headers } = await setup();
  const phone = await headers('anna@test.ru', 'anna-pass-1');
  const laptop = await headers('anna@test.ru', 'anna-pass-1');
  const change = (payload: object) => app.inject({ method: 'POST', url: '/api/auth/password', headers: laptop, payload });
  assert.equal((await change({ current: 'wrong-pass', next: 'new-pass-123' })).statusCode, 400);
  assert.equal((await change({ current: 'anna-pass-1', next: 'short' })).statusCode, 400);
  assert.equal((await change({ current: 'anna-pass-1', next: 'new-pass-123' })).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/auth/me', headers: laptop })).statusCode, 200, 'this session stays');
  assert.equal((await app.inject({ url: '/api/auth/me', headers: phone })).statusCode, 401, 'other sessions end');
  assert.equal((await login('anna@test.ru', 'new-pass-123')).statusCode, 200);
});

test('an admin resets a password and turns access off; a manager cannot', async () => {
  const { app, admin, anna, login, headers } = await setup();
  const a = await headers('admin@test.ru', 'admin-pass-1');
  const n = await headers('anna@test.ru', 'anna-pass-1');
  assert.equal((await app.inject({ method: 'POST', url: `/api/managers/${admin.id}/disabled`, headers: n, payload: { disabled: true } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: `/api/managers/${anna.id}/password`, headers: a, payload: { password: 'reset-pass-1' } })).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/auth/me', headers: n })).statusCode, 401, 'a reset signs the colleague out');
  assert.equal((await login('anna@test.ru', 'reset-pass-1')).statusCode, 200);

  const off = await app.inject({ method: 'POST', url: `/api/managers/${anna.id}/disabled`, headers: a, payload: { disabled: true } });
  assert.equal(off.json().manager.disabled, true);
  assert.equal((await login('anna@test.ru', 'reset-pass-1')).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: `/api/managers/${admin.id}/disabled`, headers: a, payload: { disabled: true } })).statusCode, 400, 'not yourself');
  await app.inject({ method: 'POST', url: `/api/managers/${anna.id}/disabled`, headers: a, payload: { disabled: false } });
  assert.equal((await login('anna@test.ru', 'reset-pass-1')).statusCode, 200);
});

test('sign-in attempts from one address are limited', async () => {
  const { login } = await setup();
  for (let i = 0; i < 20; i++) await login(`nobody${i}@test.ru`, 'x');
  const r = await login('admin@test.ru', 'admin-pass-1');
  assert.equal(r.statusCode, 429);
});

test('SMS codes cannot be requested again and again', async () => {
  const { app, headers } = await setup();
  const a = await headers('admin@test.ru', 'admin-pass-1');
  const deal = (await app.inject({ method: 'POST', url: '/api/deals', headers: a,
    payload: { clientName: 'Петров Пётр', phone: '+7 900 123-45-67', subject: 'Лодка', total: 100000, downPct: 20, term: 6 } })).json().deal;
  const c = `/api/client/${deal.token}`;
  await app.inject({ method: 'POST', url: `${c}/start` });
  assert.equal((await app.inject({ method: 'POST', url: `${c}/phone/send`, payload: { phone: deal.phone } })).statusCode, 200);
  const again = await app.inject({ method: 'POST', url: `${c}/phone/send`, payload: { phone: deal.phone } });
  assert.equal(again.statusCode, 429);
  assert.match(again.json().error, /через \d+ с/);
});

test('responses carry security headers', async () => {
  const { app } = await setup();
  const r = await app.inject({ url: '/api/health' });
  assert.equal(r.headers['referrer-policy'], 'no-referrer');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['x-frame-options'], 'DENY');
});

test('encoded addresses do not slip past the limits', async () => {
  const { app } = await setup();
  for (let i = 0; i < 20; i++) await app.inject({ method: 'POST', url: '/api/auth/%6Cogin', payload: { email: `x${i}@test.ru`, password: 'x' } });
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@test.ru', password: 'admin-pass-1' } });
  assert.equal(r.statusCode, 429);
});

test('parallel code requests count against the limit; foreign numbers are refused', async () => {
  const { app, headers } = await setup();
  const a = await headers('admin@test.ru', 'admin-pass-1');
  const deal = (await app.inject({ method: 'POST', url: '/api/deals', headers: a,
    payload: { clientName: 'Петров Пётр', phone: '+7 900 123-45-67', subject: 'Лодка', total: 100000, downPct: 20, term: 6 } })).json().deal;
  const c = `/api/client/${deal.token}`;
  await app.inject({ method: 'POST', url: `${c}/start` });
  assert.equal((await app.inject({ method: 'POST', url: `${c}/phone/send`, payload: { phone: '+44 20 7946 0958' } })).statusCode, 400);
  const sends = await Promise.all(Array.from({ length: 10 }, () => app.inject({ method: 'POST', url: `${c}/phone/send`, payload: { phone: deal.phone } })));
  assert.equal(sends.filter((r) => r.statusCode === 200).length, 1);
});

test('a deal needs a sensible down payment and installments of at least 1 ₽', async () => {
  const { app, headers } = await setup();
  const a = await headers('admin@test.ru', 'admin-pass-1');
  const base = { clientName: 'Петров Пётр', phone: '+7 900 123-45-67', subject: 'Лодка', total: 100000, downPct: 20, term: 6 };
  const create = (p: object) => app.inject({ method: 'POST', url: '/api/deals', headers: a, payload: { ...base, ...p } });
  for (const bad of [{ downPct: 100 }, { downPct: 0 }, { total: 5, term: 12 }, { total: 1e300 }, { phone: 123 }, { clientName: ['x'] }]) {
    assert.equal((await create(bad)).statusCode, 400, JSON.stringify(bad));
  }
  assert.equal((await create({})).statusCode, 201);
});
