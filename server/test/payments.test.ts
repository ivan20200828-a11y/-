import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildApp } from '../src/app.ts';
import { openDb } from '../src/db.ts';
import type { DealService } from '../src/deals.ts';
import { tkassa, tkassaToken, type ReceiptConfig } from '../src/payments/tkassa.ts';
import { ESIGN_AGREEMENT } from '../src/esign.ts';
import { testProviders } from '../src/providers.ts';

const KEY = 'TestTerminal';
const PASSWORD = 'secret';

/** A stand-in for the Т-Касса API: checks request signatures and remembers payments. */
function fakeBank() {
  const payments = new Map<string, { OrderId: string; Amount: number; Status: string }>();
  const requests: { method: string; body: Record<string, unknown> }[] = [];
  let next = 1000;
  const fetch = (async (url: string, init: { body: string }) => {
    const method = url.split('/').pop()!;
    const body = JSON.parse(init.body);
    requests.push({ method, body });
    const reply = (data: object) => new Response(JSON.stringify({ Success: true, ErrorCode: '0', ...data }));
    if (body.TerminalKey !== KEY || body.Token !== tkassaToken(body, PASSWORD)) {
      return new Response(JSON.stringify({ Success: false, ErrorCode: '204', Message: 'Неверный токен' }));
    }
    if (method === 'Init') {
      const id = String(next++);
      payments.set(id, { OrderId: body.OrderId, Amount: body.Amount, Status: 'NEW' });
      return reply({ PaymentId: id, Status: 'NEW', PaymentURL: `https://pay.test/${id}` });
    }
    if (method === 'GetQr') return reply({ Data: `https://qr.nspk.ru/${body.PaymentId}` });
    if (method === 'GetState') return reply({ Status: payments.get(String(body.PaymentId))!.Status });
    return new Response('{}', { status: 404 });
  }) as unknown as typeof globalThis.fetch;
  /** The notification the bank would post when a payment reaches `status`. */
  const notify = (paymentId: string, status: string, patch: Record<string, unknown> = {}) => {
    const p = payments.get(paymentId)!;
    p.Status = status;
    const n: Record<string, unknown> = {
      TerminalKey: KEY, OrderId: p.OrderId, Success: status !== 'REJECTED', Status: status,
      PaymentId: Number(paymentId), ErrorCode: '0', Amount: p.Amount, CardId: 1, Pan: '430000******0777', ExpDate: '1230', ...patch,
    };
    return { ...n, Token: tkassaToken(n, PASSWORD) };
  };
  return { fetch, notify, payments, requests };
}

async function setup(receipts?: ReceiptConfig) {
  const bank = fakeBank();
  const payments = tkassa({ terminalKey: KEY, password: PASSWORD, publicUrl: 'https://api.test/', fetch: bank.fetch, receipts });
  const { app, deals } = buildApp({ db: openDb(':memory:'), providers: { ...testProviders, payments }, appUrl: 'https://app.test' });
  const deal = deals.create({ clientName: 'Петров Пётр Петрович', phone: '+7 900 123-45-67', subject: 'Лодка', total: 1000000, downPct: 20, term: 12 });
  await signDeal(deals, deal.token);
  return { app, deals, bank, token: deal.token };
}

async function signDeal(svc: DealService, token: string) {
  svc.start(token);
  await svc.sendPhoneCode(token, svc.byToken(token).phone);
  svc.verifyPhone(token, '1234');
  const { passport } = await svc.recognize(token, null, null);
  svc.confirmPassport(token, passport);
  svc.acceptContract(token, ESIGN_AGREEMENT.edition);
  await svc.sendSignCode(token);
  svc.verifySign(token, '1234');
}

test('Т-Касса token: sorted scalar values plus the password, nested objects left out', () => {
  const a = tkassaToken({ TerminalKey: 'T', Amount: 100, OrderId: '1', DATA: { x: 1 }, Token: 'old' }, 'p');
  const b = tkassaToken({ OrderId: '1', Amount: 100, TerminalKey: 'T' }, 'p');
  assert.equal(a, b);
  assert.notEqual(a, tkassaToken({ OrderId: '1', Amount: 101, TerminalKey: 'T' }, 'p'));
});

test('SBP down payment waits for the bank notification', async () => {
  const { app, bank, token } = await setup();
  const c = `/api/client/${token}`;

  const started = (await app.inject({ method: 'POST', url: `${c}/pay`, payload: { what: 'down', method: 'sbp' } })).json();
  assert.equal(started.payment.status, 'pending');
  assert.match(started.payment.url, /^https:\/\/qr\.nspk\.ru\//);
  assert.equal(started.deal.stage, 'pay', 'nothing is paid until the bank confirms');
  const init = bank.requests.find((r) => r.method === 'Init')!.body;
  assert.equal(init.Amount, 200000 * 100, 'amount goes to the bank in kopecks');
  assert.equal(init.NotificationURL, 'https://api.test/api/payments/notify');
  assert.equal(init.SuccessURL, `https://app.test/client/cabinet?t=${token}`);

  const paymentId = [...bank.payments.keys()][0];
  const forged = { ...bank.notify(paymentId, 'CONFIRMED'), Token: 'f'.repeat(64) };
  assert.equal((await app.inject({ method: 'POST', url: '/api/payments/notify', payload: forged })).statusCode, 403);
  const underpaid = bank.notify(paymentId, 'CONFIRMED', { Amount: 100 });
  await app.inject({ method: 'POST', url: '/api/payments/notify', payload: underpaid });
  assert.equal((await app.inject({ method: 'GET', url: c })).json().deal.stage, 'pay', 'a wrong amount does not count');

  const ok = await app.inject({ method: 'POST', url: '/api/payments/notify', payload: bank.notify(paymentId, 'CONFIRMED') });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body, 'OK');
  await app.inject({ method: 'POST', url: '/api/payments/notify', payload: bank.notify(paymentId, 'CONFIRMED') });

  const after = (await app.inject({ method: 'GET', url: `${c}/payments/${started.payment.id}` })).json();
  assert.equal(after.payment.status, 'paid');
  assert.equal(after.deal.stage, 'active');
  assert.equal(after.deal.downPayment.method, 'sbp');
});

test('a late webhook is covered by asking the bank for the status', async () => {
  const { app, bank, token } = await setup();
  const c = `/api/client/${token}`;
  const card = (await app.inject({ method: 'POST', url: `${c}/pay`, payload: { what: 'down', method: 'card' } })).json();
  assert.match(card.payment.url, /^https:\/\/pay\.test\//, 'card payments go to the bank page');

  const [paymentId] = bank.payments.keys();
  assert.equal((await app.inject({ method: 'GET', url: `${c}/payments/${card.payment.id}` })).json().payment.status, 'pending');
  bank.payments.get(paymentId)!.Status = 'REJECTED';
  const rejected = (await app.inject({ method: 'GET', url: `${c}/payments/${card.payment.id}` })).json();
  assert.equal(rejected.payment.status, 'failed');
  assert.equal(rejected.deal.stage, 'pay');

  // The client tries again, pays twice by mistake: only the first payment counts.
  const a = (await app.inject({ method: 'POST', url: `${c}/pay`, payload: { what: 'down', method: 'sbp' } })).json();
  const b = (await app.inject({ method: 'POST', url: `${c}/pay`, payload: { what: 'down', method: 'sbp' } })).json();
  const [, idA, idB] = bank.payments.keys();
  await app.inject({ method: 'POST', url: '/api/payments/notify', payload: bank.notify(idA, 'CONFIRMED') });
  await app.inject({ method: 'POST', url: '/api/payments/notify', payload: bank.notify(idB, 'CONFIRMED') });
  assert.equal((await app.inject({ method: 'GET', url: `${c}/payments/${a.payment.id}` })).json().deal.stage, 'active');
  assert.equal((await app.inject({ method: 'GET', url: `${c}/payments/${b.payment.id}` })).json().payment.status, 'paid');
  assert.equal((await app.inject({ method: 'GET', url: `${c}/payments/nope` })).statusCode, 404);
});

test('payments carry a 54-ФЗ receipt when the taxation system is set', async () => {
  const { app, bank, token } = await setup({ taxation: 'usn_income', tax: 'none', handover: 'signing', ffd: '1.2' });
  const c = `/api/client/${token}`;
  await app.inject({ method: 'POST', url: `${c}/pay`, payload: { what: 'down', method: 'card' } });
  const init = bank.requests.find((r) => r.method === 'Init')!.body;
  assert.equal(init.Token, tkassaToken(init, PASSWORD), 'the receipt does not break the signature');
  assert.deepEqual(init.Receipt, {
    FfdVersion: '1.2', Taxation: 'usn_income', Phone: '+79001234567',
    Items: [{ Name: 'Лодка', Price: 200000 * 100, Quantity: 1, Amount: 200000 * 100, Tax: 'none',
      PaymentMethod: 'partial_payment', PaymentObject: 'commodity', MeasurementUnit: 'шт' }],
  });
  await app.inject({ method: 'POST', url: '/api/payments/notify', payload: bank.notify([...bank.payments.keys()][0], 'CONFIRMED') });
  await app.inject({ method: 'POST', url: `${c}/pay`, payload: { what: 'next', method: 'sbp' } });
  const item = (bank.requests.filter((r) => r.method === 'Init')[1].body.Receipt as { Items: Record<string, unknown>[] }).Items[0];
  assert.equal(item.PaymentMethod, 'credit_payment', 'installments repay the credit');
  assert.equal(item.PaymentObject, 'payment');
});

test('without receipt settings no receipt is sent', async () => {
  const { app, bank, token } = await setup();
  await app.inject({ method: 'POST', url: `/api/client/${token}/pay`, payload: { what: 'down', method: 'card' } });
  assert.equal(bank.requests.find((r) => r.method === 'Init')!.body.Receipt, undefined);
});
