import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildApp } from '../src/app.ts';
import { openDb } from '../src/db.ts';
import { installmentAmounts } from '../src/deals.ts';
import { testProviders } from '../src/providers.ts';

let auth: { authorization: string };

async function setup() {
  const { app, auth: accounts } = buildApp({ db: openDb(':memory:'), providers: testProviders });
  accounts.addManager('m@test.ru', 'Тест', 'secret-pass');
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'M@test.ru ', password: 'secret-pass' } });
  auth = { authorization: `Bearer ${r.json().token}` };
  return app;
}

const newDeal = { clientName: 'Петров Пётр Петрович', phone: '+7 900 123-45-67', subject: 'Лодка', total: 1000000, downPct: 20, term: 12 };

test('installments add up to the amount left after the down payment', () => {
  const a = installmentAmounts({ total: 2490000, downPct: 20, term: 24 });
  assert.equal(a.length, 24);
  assert.equal(a.reduce((x, y) => x + y, 0), 2490000 - 498000);
  const b = installmentAmounts({ total: 1000001, downPct: 33, term: 7 });
  assert.equal(b.reduce((x, y) => x + y, 0), 1000001 - Math.round(1000001 * 0.33));
});

test('manager routes need a signed-in manager', async () => {
  const app = await setup();
  assert.equal((await app.inject({ method: 'GET', url: '/api/deals' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/api/deals', headers: { authorization: 'Bearer nope' } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/api/deals', headers: auth })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth })).json().manager.email, 'm@test.ru');
  await app.inject({ method: 'POST', url: '/api/auth/logout', headers: auth });
  assert.equal((await app.inject({ method: 'GET', url: '/api/deals', headers: auth })).statusCode, 401);
});

test('login locks after five wrong passwords', async () => {
  const app = await setup();
  const login = (password: string) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'm@test.ru', password } });
  assert.equal((await login('wrong')).statusCode, 401);
  for (let i = 0; i < 4; i++) await login('wrong');
  assert.equal((await login('secret-pass')).statusCode, 429);
});

test('a deal goes from invitation to the first installment', async () => {
  const app = await setup();
  const post = async (url: string, payload: object = {}) => {
    const r = await app.inject({ method: 'POST', url, payload });
    return { status: r.statusCode, body: r.json() };
  };

  const created = await app.inject({ method: 'POST', url: '/api/deals', headers: auth, payload: newDeal });
  assert.equal(created.statusCode, 201);
  const { token, id } = created.json().deal;
  const c = `/api/client/${token}`;

  assert.equal((await post(`${c}/start`)).body.deal.stage, 'phone');
  assert.equal((await post(`${c}/phone/verify`, { code: '1234' })).status, 400, 'verify before a code was sent');
  await post(`${c}/phone/send`, { phone: '+7 900 123-45-67' });
  const wrong = await post(`${c}/phone/verify`, { code: '0000' });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /Код не подходит/);
  assert.equal((await post(`${c}/phone/verify`, { code: '1234' })).body.deal.stage, 'documents');

  assert.equal((await post(`${c}/sign/send`)).status, 409, 'cannot jump ahead to signing');

  const kyc = await post(`${c}/kyc`, { passportImage: Buffer.from('fake').toString('base64') });
  assert.equal(kyc.body.faceMatch, 97);
  assert.equal((await post(`${c}/passport`, { passport: { ...kyc.body.passport, fio: '' } })).status, 400);
  const confirmed = await post(`${c}/passport`, { passport: kyc.body.passport });
  assert.equal(confirmed.body.deal.stage, 'contract');
  assert.equal(confirmed.body.deal.clientName, kyc.body.passport.fio);

  await post(`${c}/contract/accept`);
  await post(`${c}/sign/send`);
  const signed = await post(`${c}/sign/verify`, { code: '1234' });
  assert.equal(signed.body.deal.stage, 'pay');
  assert.match(signed.body.deal.signature.id, /^ПЭП-/);

  assert.equal((await post(`${c}/pay`, { what: 'next', method: 'sbp' })).status, 409, 'installments only after the down payment');
  const paid = await post(`${c}/pay`, { what: 'down', method: 'card' });
  assert.equal(paid.body.deal.stage, 'active');
  const first = await post(`${c}/pay`, { what: 'next', method: 'sbp' });
  assert.deepEqual(first.body.deal.installmentsPaid.map((p: { n: number }) => p.n), [1]);

  const details = (await app.inject({ method: 'GET', url: `/api/deals/${id}`, headers: auth })).json();
  assert.deepEqual(
    details.events.map((e: { type: string }) => e.type),
    ['created', 'started', 'phone_code_sent', 'phone_verified', 'kyc_checked', 'passport_confirmed', 'contract_accepted', 'sign_code_sent', 'signed', 'payment_started', 'paid', 'payment_started', 'paid'],
  );
});

test('codes lock after too many wrong attempts', async () => {
  const app = await setup();
  const { token } = (await app.inject({ method: 'POST', url: '/api/deals', headers: auth, payload: newDeal })).json().deal;
  const c = `/api/client/${token}`;
  await app.inject({ method: 'POST', url: `${c}/start` });
  await app.inject({ method: 'POST', url: `${c}/phone/send`, payload: { phone: newDeal.phone } });
  for (let i = 0; i < 5; i++) await app.inject({ method: 'POST', url: `${c}/phone/verify`, payload: { code: '0000' } });
  const r = await app.inject({ method: 'POST', url: `${c}/phone/verify`, payload: { code: '1234' } });
  assert.equal(r.statusCode, 429);
});

test('bad deal input is rejected with a readable message', async () => {
  const app = await setup();
  const r = await app.inject({ method: 'POST', url: '/api/deals', headers: auth, payload: { ...newDeal, total: -5 } });
  assert.equal(r.statusCode, 400);
  assert.match(r.json().error, /Стоимость/);
  assert.equal((await app.inject({ method: 'GET', url: '/api/client/nope' })).statusCode, 404);
});

test('the contract downloads as a PDF', async () => {
  const app = await setup();
  const { token } = (await app.inject({ method: 'POST', url: '/api/deals', headers: auth, payload: newDeal })).json().deal;
  const r = await app.inject({ method: 'GET', url: `/api/client/${token}/contract.pdf` });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['content-type'], 'application/pdf');
  assert.equal(r.rawPayload.subarray(0, 5).toString(), '%PDF-');
});
