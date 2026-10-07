import { DealService } from './deals.ts';
import { ESIGN_AGREEMENT } from './esign.ts';
import { testProviders } from './providers.ts';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

/** Demo deals for an empty database. The first one opens with the client token "demo". */
export function seedDemo(live: DealService) {
  if (live.list().length > 0) return;
  const svc = new DealService(live.db, testProviders);
  // Example requisites so the demo contract looks complete; replace them in «Компания».
  svc.company.update(null, {
    name: 'ООО «Альфа-Сделка»', city: 'Москва', inn: '7701234567', kpp: '770101001', ogrn: '1237700012345',
    address: '123100, г. Москва, Пресненская наб., д. 12, офис 45',
    director: 'генерального директора Андреева Павла Викторовича, действующего на основании Устава',
    bank: 'АО «Пример Банк»', bik: '044525999', account: '40702810900000012345', corrAccount: '30101810400000000999',
    phone: '+7 495 123-45-67', email: 'info@alfa-sdelka.ru',
  });
  svc.create({ clientName: 'Ковалёва Мария Игоревна', phone: '+7 925 301-44-12', subject: 'Квартира-студия, ЖК «Река»', total: 6800000, downPct: 30, term: 36 },
    { id: 'd139', token: 'demo-kovaleva', createdAt: daysAgo(70) });
  svc.create({ clientName: 'Ибрагимов Руслан Тимурович', phone: '+7 903 718-02-55', subject: 'Kia Sportage 2024', total: 3150000, downPct: 15, term: 18 },
    { id: 'd142', token: 'demo-ibragimov', createdAt: daysAgo(3) });
  svc.create({ clientName: 'Орлова Анна Сергеевна', phone: '+7 977 640-90-31', subject: 'Кухонный гарнитур под заказ', total: 420000, downPct: 30, term: 6 },
    { id: 'd145', token: 'demo-orlova', createdAt: daysAgo(1) });
  svc.create({ clientName: 'Смирнов Алексей Петрович', phone: '+7 916 555-18-40', subject: 'Автомобиль Haval Jolion, 2025 г.', total: 2490000, downPct: 20, term: 24 },
    { id: 'd147', token: 'demo', createdAt: daysAgo(0) });
}

/** Walks a demo deal through every stage with test codes so the manager list shows deals at different stages. */
export async function advanceDemo(live: DealService) {
  // Demo payments never go to a real acquirer.
  const svc = new DealService(live.db, testProviders);
  const walk = async (token: string, upTo: 'documents' | 'sign' | 'active', payments = 0) => {
    if (svc.byToken(token).stage !== 'invited') return;
    svc.start(token);
    await svc.sendPhoneCode(token, svc.byToken(token).phone);
    svc.verifyPhone(token, '1234');
    if (upTo === 'documents') return;
    const { passport } = await svc.recognize(token, null, null);
    svc.confirmPassport(token, { ...passport, fio: svc.byToken(token).clientName });
    svc.acceptContract(token, ESIGN_AGREEMENT.edition);
    if (upTo === 'sign') return;
    await svc.sendSignCode(token);
    svc.verifySign(token, '1234');
    await svc.pay(token, 'down', 'sbp');
    for (let i = 0; i < payments; i++) await svc.pay(token, 'next', 'sbp');
  };
  const fresh = svc.byToken('demo-kovaleva').stage === 'invited';
  await walk('demo-kovaleva', 'active', 2);
  // Ковалёва signed long ago and missed her third payment, so the manager sees an overdue deal.
  if (fresh) {
    const signedAt = daysAgo(100);
    const signature = { ...svc.byToken('demo-kovaleva').signature!, at: signedAt };
    svc.db.prepare('UPDATE deals SET signature = ?, down_payment = ? WHERE id = ?')
      .run(JSON.stringify(signature), JSON.stringify({ at: signedAt, method: 'sbp' }), 'd139');
    svc.db.prepare(`UPDATE payments SET at = CASE n WHEN 1 THEN ? WHEN 2 THEN ? ELSE at END WHERE deal_id = 'd139'`)
      .run(daysAgo(70), daysAgo(40));
  }
  const ibragimovFresh = svc.byToken('demo-ibragimov').stage === 'invited';
  await walk('demo-ibragimov', 'sign');
  // Ибрагимов accepted the contract days ago and has not signed: the manager sees him under «Застряли».
  if (ibragimovFresh) svc.db.prepare(`UPDATE events SET at = ? WHERE deal_id = 'd142'`).run(daysAgo(4));
  await walk('demo-orlova', 'documents');
}
