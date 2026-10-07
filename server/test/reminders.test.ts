import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openDb } from '../src/db.ts';
import { DealService } from '../src/deals.ts';
import { ESIGN_AGREEMENT } from '../src/esign.ts';
import { testProviders } from '../src/providers.ts';
import { addMonths } from '../src/schedule.ts';

test('months keep the day or clamp to the end of a shorter month', () => {
  assert.equal(addMonths(new Date(2026, 0, 31), 1).getDate(), 28);
  assert.equal(addMonths(new Date(2028, 0, 31), 1).getDate(), 29);
  assert.equal(addMonths(new Date(2026, 9, 5), 3).getMonth(), 0);
});

test('payment reminders go out once before the date and once when it is missed', async () => {
  const texts: string[] = [];
  const svc = new DealService(openDb(':memory:'), { ...testProviders, sms: { ...testProviders.sms, send: async (_p, t) => { texts.push(t); } } },
    { appUrl: 'https://app.test' });
  const { token } = svc.create({ clientName: 'Петров Пётр Петрович', phone: '+7 900 123-45-67', subject: 'Лодка', total: 1000000, downPct: 20, term: 12 });
  svc.start(token);
  await svc.sendPhoneCode(token, '+7 900 123-45-67');
  svc.verifyPhone(token, '1234');
  const { passport } = await svc.recognize(token, null, null);
  svc.confirmPassport(token, passport);
  svc.acceptContract(token, ESIGN_AGREEMENT.edition);
  await svc.sendSignCode(token);
  svc.verifySign(token, '1234');
  await svc.pay(token, 'down', 'sbp');
  texts.length = 0;

  const due = addMonths(new Date(svc.byToken(token).signature!.at), 1);
  // Noon in Moscow on the day `days` from the due date: reminders only go out in the daytime.
  const at = (days: number, hour = 12) => {
    const x = new Date(+due + days * 86400000 + 3 * 3600000);
    return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate(), hour - 3));
  };
  assert.equal((await svc.sendReminders(at(-10))).length, 0, 'too early');
  assert.equal((await svc.sendReminders(at(-2, 7))).length, 0, 'not at night');
  assert.equal((await svc.sendReminders(at(-2, 21))).length, 0, 'not in the evening');
  assert.equal((await svc.sendReminders(at(-2)))[0].type, 'reminder_soon');
  assert.equal((await svc.sendReminders(at(-1))).length, 0, 'sent once');
  assert.match(texts[0], /платёж 1 по договору Д-\d{4}-\d{4} на 66\s666 ₽ до /);
  assert.match(texts[0], /https:\/\/app\.test\/client\?t=/);

  assert.equal((await svc.sendReminders(at(1)))[0].type, 'reminder_overdue');
  assert.equal((await svc.sendReminders(at(5))).length, 0);
  assert.match(texts[1], /просрочен/);

  await svc.pay(token, 'next', 'sbp');
  assert.equal((await svc.sendReminders(at(5))).length, 0, 'nothing due after paying');
});

test('two overlapping reminder runs send one SMS', async () => {
  let sends = 0;
  const slow = { ...testProviders.sms, send: async () => { sends++; await new Promise((r) => setTimeout(r, 50)); } };
  const svc = new DealService(openDb(':memory:'), { ...testProviders, sms: slow });
  const { token } = svc.create({ clientName: 'Петров Пётр Петрович', phone: '+7 900 123-45-67', subject: 'Лодка', total: 1000000, downPct: 20, term: 12 });
  svc.start(token);
  await svc.sendPhoneCode(token, '+7 900 123-45-67');
  svc.verifyPhone(token, '1234');
  const { passport } = await svc.recognize(token, null, null);
  svc.confirmPassport(token, passport);
  svc.acceptContract(token, ESIGN_AGREEMENT.edition);
  await svc.sendSignCode(token);
  svc.verifySign(token, '1234');
  await svc.pay(token, 'down', 'sbp');
  const due = addMonths(new Date(svc.byToken(token).signature!.at), 1);
  const x = new Date(+due - 86400000 + 3 * 3600000);
  const noon = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate(), 9));
  sends = 0;
  const [a, b] = await Promise.all([svc.sendReminders(noon), svc.sendReminders(noon)]);
  assert.equal(a.length + b.length, 1);
  assert.equal(sends, 1);
});
