import { createRequire } from 'node:module';
import path from 'node:path';

import PDFDocument from 'pdfkit';

import { downAmount, installmentAmounts } from './deals.ts';
import { sellerIntro, sellerRequisites } from './company.ts';
import { ESIGN_AGREEMENT } from './esign.ts';
import { addMonths } from './schedule.ts';
import type { Company, Deal } from './types.ts';

const require = createRequire(import.meta.url);
const FONT_DIR = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');

const rub = (n: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n))} ₽`;
const date = (d: Date) => d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow' });
const dateTime = (d: Date) => `${date(d)} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })} МСК`;

/** The contract as a PDF, with the payment schedule and, once signed, the electronic signature details. */
/** The buyer's block in the "Реквизиты сторон" section. */
function buyerRequisites(deal: Deal) {
  const p = deal.passport;
  return [
    p?.fio ?? deal.clientName,
    p && `Паспорт ${p.series}, выдан ${p.issued} ${p.issuedAt}`,
    p && `Адрес регистрации: ${p.address}`,
    `Телефон: ${deal.phone}`,
  ].filter(Boolean) as string[];
}

/** An A4 document with the Cyrillic fonts registered; `done` resolves to the file once `doc.end()` is called. */
function newDoc(title: string) {
  const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: title } });
  doc.registerFont('regular', path.join(FONT_DIR, 'DejaVuSerif.ttf'));
  doc.registerFont('bold', path.join(FONT_DIR, 'DejaVuSerif-Bold.ttf'));
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  return { doc, done };
}

/** A table row on fixed columns that moves to a new page near the bottom. */
function tableRow(doc: PDFKit.PDFDocument, cols: { x: number; width: number; align?: 'left' | 'right' }[], cells: string[], bold = false) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 20) doc.addPage();
  const y = doc.y;
  doc.font(bold ? 'bold' : 'regular');
  let bottom = y;
  cells.forEach((cell, i) => {
    doc.text(cell, cols[i].x, y, { width: cols[i].width, align: cols[i].align ?? 'left' });
    bottom = Math.max(bottom, doc.y);
  });
  doc.x = doc.page.margins.left;
  doc.y = bottom;
  doc.moveDown(0.25);
}

const METHOD: Record<string, string> = { sbp: 'СБП', card: 'карта', transfer: 'перевод по реквизитам', cash: 'наличные' };

/**
 * A statement of what the buyer has paid under the contract and what is left, for the client's records
 * (a bank, a tax deduction, a dispute). Built from the payments recorded in the app.
 */
export function paymentsPdf(deal: Deal, fallback?: Company, now = new Date()): Promise<Buffer> {
  const seller = deal.sellerDetails ?? { ...(fallback as Company), name: deal.seller, city: deal.city };
  const { doc, done } = newDoc(`Справка об оплате по договору № ${deal.no}`);
  const down = downAmount(deal);
  const amounts = installmentAmounts(deal);
  const start = deal.signature ? new Date(deal.signature.at) : now;

  const paid: { at: Date; what: string; amount: number; method: string }[] = [];
  if (deal.downPayment) paid.push({ at: new Date(deal.downPayment.at), what: 'Первоначальный взнос', amount: down, method: deal.downPayment.method });
  for (const p of [...deal.installmentsPaid].sort((a, b) => a.n - b.n)) {
    paid.push({ at: new Date(p.at), what: `Платёж ${p.n} из ${deal.term}`, amount: amounts[p.n - 1], method: p.method });
  }
  const total = paid.reduce((a, p) => a + p.amount, 0);
  const left = deal.total - total;

  doc.font('bold').fontSize(12).text('СПРАВКА ОБ ОПЛАТЕ', { align: 'center' }).moveDown(0.3)
    .font('regular').fontSize(10.5).text(`по договору купли-продажи с рассрочкой платежа № ${deal.no}`, { align: 'center' }).moveDown(0.8);
  doc.text(`Дата справки: ${date(now)}`).moveDown(0.4);
  doc.text(`Продавец: ${seller.name}${seller.inn ? `, ИНН ${seller.inn}` : ''}`);
  doc.text(`Покупатель: ${deal.passport?.fio ?? deal.clientName}`);
  doc.text(`Предмет договора: ${deal.subject}`);
  doc.text(`Цена по договору: ${rub(deal.total)}${deal.signature ? `, договор подписан ${date(start)}` : ''}`).moveDown(0.8);

  const x = doc.page.margins.left;
  const cols = [{ x, width: 80 }, { x: x + 84, width: 150 }, { x: x + 238, width: 130 }, { x: x + 372, width: 110, align: 'right' as const }];
  doc.font('bold').text('Поступившие платежи').moveDown(0.3);
  if (paid.length) {
    tableRow(doc, cols, ['Дата', 'Назначение', 'Способ', 'Сумма'], true);
    for (const p of paid) tableRow(doc, cols, [date(p.at), p.what, METHOD[p.method] ?? p.method, rub(p.amount)]);
  } else {
    doc.font('regular').text('Платежей по договору пока не поступало.');
  }
  doc.moveDown(0.6).font('bold').text(`Всего оплачено: ${rub(total)}`);
  if (left > 0) {
    const nextN = deal.installmentsPaid.length + 1;
    doc.font('regular').text(`Остаток к оплате: ${rub(left)}`);
    if (deal.downPayment && nextN <= deal.term) {
      const due = addMonths(start, nextN);
      const late = date(due) !== date(now) && due < now;
      doc.text(`Следующий платёж: ${rub(amounts[nextN - 1])} до ${date(due)}${late ? ' (срок прошёл)' : ''}`);
    }
  } else {
    doc.font('regular').text('Обязательства Покупателя по оплате цены договора исполнены полностью. Задолженности нет.');
  }
  doc.moveDown(1.2).text(`${seller.name}`).fillColor('#666666').fontSize(9)
    .text('Справка сформирована автоматически по данным о платежах в приложении «Сделка онлайн».');
  doc.end();
  return done;
}

/** `fallback` is the current company, for deals created before details were stored with the deal. */
export function contractPdf(deal: Deal, fallback?: Company): Promise<Buffer> {
  const seller = deal.sellerDetails ?? { ...(fallback as Company), name: deal.seller, city: deal.city };
  const { doc, done } = newDoc(`Договор № ${deal.no}`);

  const p = deal.passport;
  const down = downAmount(deal);
  const signedAt = deal.signature ? new Date(deal.signature.at) : null;
  const start = signedAt ?? new Date();
  const para = (title: string, text: string) => {
    doc.font('bold').text(`${title} `, { continued: true }).font('regular').text(text, { align: 'left' }).moveDown(0.6);
  };

  doc.fontSize(10.5);
  doc.font('bold').fontSize(12).text(`ДОГОВОР КУПЛИ-ПРОДАЖИ С РАССРОЧКОЙ ПЛАТЕЖА № ${deal.no}`, { align: 'center' }).moveDown(0.8);
  doc.font('regular').fontSize(10.5).text(`г. ${deal.city}`, { continued: true }).text(date(start), { align: 'right' }).moveDown(0.8);
  doc.text(
    `${sellerIntro(seller)}, именуемое «Продавец», и гражданин(ка) РФ ${p?.fio ?? deal.clientName}` +
      (p ? `, ${p.birth} г. р., паспорт ${p.series}, выдан ${p.issued} ${p.issuedAt}, зарегистрирован(а) по адресу: ${p.address}` : '') +
      ', именуемый(ая) «Покупатель», заключили настоящий договор о нижеследующем.',
    { align: 'left' },
  ).moveDown(0.6);
  para('1. Предмет.', `Продавец передаёт в собственность Покупателя: ${deal.subject.replace(/\.$/, '')}.`);
  para('2. Цена.', `Цена составляет ${rub(deal.total)}. Первоначальный взнос ${rub(down)} оплачивается в течение 3 рабочих дней после подписания. ` +
    `Остаток ${rub(deal.total - down)} оплачивается в рассрочку на ${deal.term} мес. согласно Приложению № 1, без процентов.`);
  para('3. Подписание.', 'Договор подписывается простой электронной подписью (кодом из SMS) в порядке, установленном Соглашением об использовании простой электронной подписи (Приложение № 2). Стороны признают такую подпись равнозначной собственноручной в соответствии с Федеральным законом № 63-ФЗ «Об электронной подписи».');
  para('4. Просрочка.', 'За просрочку платежа начисляется неустойка 0,1% от суммы просроченного платежа за каждый день.');

  doc.font('bold').text('5. Реквизиты сторон').moveDown(0.3);
  doc.font('bold').text('Продавец').font('regular');
  for (const line of sellerRequisites(seller)) doc.text(line, { align: 'left' });
  doc.moveDown(0.4).font('bold').text('Покупатель').font('regular');
  for (const line of buyerRequisites(deal)) doc.text(line, { align: 'left' });
  doc.moveDown(0.8);

  doc.moveDown(0.4).font('bold').text('Приложение № 1. График платежей').moveDown(0.4).font('regular');
  const x = doc.page.margins.left;
  const cols = [{ x, width: 36 }, { x: x + 40, width: 150 }, { x: x + 200, width: 120, align: 'right' as const }];
  const row = (cells: string[], bold = false) => tableRow(doc, cols, cells, bold);
  row(['№', 'Дата', 'Сумма'], true);
  row(['0', 'взнос', rub(down)]);
  installmentAmounts(deal).forEach((amount, i) => row([String(i + 1), date(addMonths(start, i + 1)), rub(amount)]));

  doc.moveDown(1).font('regular');
  if (deal.signature && signedAt) {
    doc.font('bold').text('Документ подписан простой электронной подписью').font('regular')
      .text(`Подписант: ${p?.fio ?? deal.clientName}, телефон ${deal.phone}`)
      .text(`Дата и время подписания: ${dateTime(signedAt)}`)
      .text(`Идентификатор подписи: ${deal.signature.id}`);
    if (deal.esignAgreement) {
      doc.text(`Соглашение об использовании простой электронной подписи (ред. ${deal.esignAgreement.edition}) принято ${dateTime(new Date(deal.esignAgreement.at))}`);
    }
  } else {
    doc.text('Проект договора. Не подписан.');
  }

  doc.addPage().font('bold').fontSize(12).text(`Приложение № 2. ${ESIGN_AGREEMENT.title}`, { align: 'left' }).moveDown(0.5)
    .font('regular').fontSize(10);
  for (const line of ESIGN_AGREEMENT.text) doc.text(line, { align: 'left' }).moveDown(0.4);

  doc.end();
  return done;
}
