import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildApp } from '../src/app.ts';
import { openDb } from '../src/db.ts';
import { installmentAmounts } from '../src/deals.ts';
import { testProviders } from '../src/providers.ts';

let auth: { authorization: string };

async function setup() {
  const { app, auth: accounts } = buildApp({ db: openDb(':memory:'), providers: testProviders });
  accounts.addManager('m@test.ru', 'Тест', 'secret-pass', true);
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

  assert.equal((await post(`${c}/contract/accept`)).status, 400, 'the e-signature agreement must be accepted');
  const accepted = await post(`${c}/contract/accept`, { esignEdition: 1 });
  assert.equal(accepted.body.deal.esignAgreement.edition, 1);
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
    ['created', 'started', 'phone_code_sent', 'phone_verified', 'kyc_checked', 'passport_confirmed', 'esign_agreement_accepted', 'contract_accepted', 'sign_code_sent', 'signed', 'payment_started', 'paid', 'payment_started', 'paid'],
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

test('the server can serve the web app with page addresses falling back to it', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const dir = mkdtempSync('/tmp/web-');
  writeFileSync(`${dir}/index.html`, '<div id="root"></div>');
  const { app } = buildApp({ db: openDb(':memory:'), providers: testProviders, webDir: dir });
  assert.match((await app.inject({ url: '/client/cabinet' })).body, /root/);
  assert.match((await app.inject({ url: '/' })).body, /root/);
  assert.equal((await app.inject({ url: '/api/nope' })).statusCode, 404);
  assert.equal((await app.inject({ url: '/api/health' })).statusCode, 200);
});

test('an admin adds colleagues; a regular manager cannot', async () => {
  const app = await setup();
  const add = (headers: Record<string, string>, payload: object) => app.inject({ method: 'POST', url: '/api/managers', headers, payload });
  const created = await add(auth, { email: 'Anna@Test.ru', name: 'Анна', password: 'anna-pass-1' });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().manager.admin, false);
  assert.equal((await add(auth, { email: 'anna@test.ru', name: 'Анна', password: 'anna-pass-1' })).statusCode, 409);
  assert.equal((await add(auth, { email: 'bad', name: 'X', password: 'long-enough' })).statusCode, 400);

  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'anna@test.ru', password: 'anna-pass-1' } });
  const anna = { authorization: `Bearer ${login.json().token}` };
  assert.equal((await app.inject({ url: '/api/deals', headers: anna })).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/managers', headers: anna })).statusCode, 403);
  assert.equal((await add(anna, { email: 'x@test.ru', name: 'X', password: 'long-enough' })).statusCode, 403);
  assert.deepEqual((await app.inject({ url: '/api/managers', headers: auth })).json().managers.map((m: { email: string }) => m.email),
    ['m@test.ru', 'anna@test.ru']);
});

test('a manager resends the invitation, sees the photos and cancels an unpaid deal', async () => {
  const app = await setup();
  const { id, token } = (await app.inject({ method: 'POST', url: '/api/deals', headers: auth, payload: newDeal })).json().deal;
  const c = `/api/client/${token}`;
  assert.equal((await app.inject({ method: 'POST', url: `/api/deals/${id}/invite`, headers: auth })).statusCode, 200);

  await app.inject({ method: 'POST', url: `${c}/start` });
  await app.inject({ method: 'POST', url: `${c}/phone/send`, payload: { phone: newDeal.phone } });
  await app.inject({ method: 'POST', url: `${c}/phone/verify`, payload: { code: '1234' } });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
  await app.inject({ method: 'POST', url: `${c}/kyc`, payload: { passportImage: jpeg, selfieImage: `data:image/jpeg;base64,${jpeg}` } });
  const { images } = (await app.inject({ url: `/api/deals/${id}/kyc`, headers: auth })).json();
  assert.match(images.passport.url, /^data:image\/jpeg;base64,\/9j\//);
  assert.ok(images.selfie);
  assert.equal((await app.inject({ url: `/api/deals/${id}/kyc` })).statusCode, 401, 'photos only for managers');

  const cancel = (payload: object) => app.inject({ method: 'POST', url: `/api/deals/${id}/cancel`, headers: auth, payload });
  assert.equal((await cancel({ reason: ' ' })).statusCode, 400);
  assert.equal((await cancel({ reason: 'Клиент передумал' })).json().deal.stage, 'cancelled');
  assert.equal((await app.inject({ url: c })).json().deal.stage, 'cancelled');
  assert.equal((await app.inject({ method: 'POST', url: `${c}/phone/send`, payload: { phone: newDeal.phone } })).statusCode, 409);
  assert.equal((await app.inject({ method: 'POST', url: `/api/deals/${id}/invite`, headers: auth })).statusCode, 409);
  const events = (await app.inject({ url: `/api/deals/${id}`, headers: auth })).json().events;
  assert.deepEqual(events.filter((e: { type: string }) => ['invite_resent', 'cancelled'].includes(e.type)).map((e: { data: { by: string } }) => e.data.by), ['Тест', 'Тест']);
});
