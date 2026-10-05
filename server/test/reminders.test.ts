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
  const at = (days: number) => new Date(+due + days * 86400000);
  assert.equal((await svc.sendReminders(at(-10))).length, 0, 'too early');
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
