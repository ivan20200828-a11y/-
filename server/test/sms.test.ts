import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DealService } from '../src/deals.ts';
import { openDb } from '../src/db.ts';
import { testProviders } from '../src/providers.ts';
import { smsc, smscPhone } from '../src/sms/smsc.ts';

test('SMSC.ru gets the login, the normalized phone and the text as a form', async () => {
  const calls: { url: string; form: URLSearchParams }[] = [];
  const fetch = (async (url: string, init: { body: URLSearchParams }) => {
    calls.push({ url, form: new URLSearchParams(init.body) });
    return new Response(JSON.stringify({ id: 1, cnt: 1 }));
  }) as unknown as typeof globalThis.fetch;
  const sms = smsc({ login: 'shop', password: 'pw', sender: 'Sdelka', fetch });
  await sms.send('8 (900) 123-45-67', 'Код: 4821');
  assert.equal(calls[0].url, 'https://smsc.ru/sys/send.php');
  assert.deepEqual(Object.fromEntries(calls[0].form), {
    login: 'shop', psw: 'pw', phones: '79001234567', mes: 'Код: 4821', fmt: '3', charset: 'utf-8', sender: 'Sdelka',
  });
  assert.match(sms.newCode(), /^\d{4}$/);
  assert.equal(smscPhone('+7 900 123-45-67'), '79001234567');
});

test('an SMS gateway error reaches the person as a readable message and is logged on the deal', async () => {
  const fetch = (async () => new Response(JSON.stringify({ error: 'no money', error_code: 3 }))) as unknown as typeof globalThis.fetch;
  const svc = new DealService(openDb(':memory:'), { ...testProviders, sms: { ...smsc({ login: 'l', password: 'p', fetch }), newCode: () => '1234' } });
  const d = svc.create({ clientName: 'Петров Пётр', phone: '+7 900 123-45-67', subject: 'Лодка', total: 100000, downPct: 20, term: 6 });
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(svc.events(d.id).some((e) => e.type === 'sms_failed'), 'a failed invitation shows in the history');
  svc.start(d.token);
  await assert.rejects(svc.sendPhoneCode(d.token, d.phone), { status: 502, message: /Не получилось отправить SMS/ });
});

test('demo deals keep test SMS and the 1234 code even with a real gateway', async () => {
  const sent: string[] = [];
  const real = { name: 'smsc', send: async (phone: string) => { sent.push(phone); }, newCode: () => '9876' };
  const svc = new DealService(openDb(':memory:'), { ...testProviders, sms: real });
  const demo = svc.create({ clientName: 'Демо', phone: '+7 900 000-00-00', subject: 'Лодка', total: 100000, downPct: 20, term: 6 }, { token: 'demo' });
  const real1 = svc.create({ clientName: 'Клиент', phone: '+7 900 111-11-11', subject: 'Лодка', total: 100000, downPct: 20, term: 6 });
  svc.start('demo');
  await svc.sendPhoneCode('demo', demo.phone);
  assert.equal(svc.verifyPhone('demo', '1234').stage, 'documents');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(sent, [real1.phone], 'only the real client got an SMS');
});
