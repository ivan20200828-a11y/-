import { createRequire } from 'node:module';
import path from 'node:path';

import PDFDocument from 'pdfkit';

import { downAmount, installmentAmounts } from './deals.ts';
import type { Deal } from './types.ts';

const require = createRequire(import.meta.url);
const FONT_DIR = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');

const rub = (n: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n))} ₽`;
const date = (d: Date) => d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow' });
const dateTime = (d: Date) => `${date(d)} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })} МСК`;
const addMonths = (d: Date, m: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + m);
  return x;
};

/** The contract as a PDF, with the payment schedule and, once signed, the electronic signature details. */
export function contractPdf(deal: Deal): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: `Договор № ${deal.no}` } });
  doc.registerFont('regular', path.join(FONT_DIR, 'DejaVuSerif.ttf'));
  doc.registerFont('bold', path.join(FONT_DIR, 'DejaVuSerif-Bold.ttf'));
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

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
    `${deal.seller}, именуемое «Продавец», и гражданин(ка) РФ ${p?.fio ?? deal.clientName}` +
      (p ? `, ${p.birth} г. р., паспорт ${p.series}, выдан ${p.issued} ${p.issuedAt}, зарегистрирован(а) по адресу: ${p.address}` : '') +
      ', именуемый(ая) «Покупатель», заключили настоящий договор о нижеследующем.',
    { align: 'left' },
  ).moveDown(0.6);
  para('1. Предмет.', `Продавец передаёт в собственность Покупателя: ${deal.subject.replace(/\.$/, '')}.`);
  para('2. Цена.', `Цена составляет ${rub(deal.total)}. Первоначальный взнос ${rub(down)} оплачивается в течение 3 рабочих дней после подписания. ` +
    `Остаток ${rub(deal.total - down)} оплачивается в рассрочку на ${deal.term} мес. согласно Приложению № 1, без процентов.`);
  para('3. Подписание.', 'Стороны признают простую электронную подпись (код из SMS) равнозначной собственноручной в соответствии с Федеральным законом № 63-ФЗ «Об электронной подписи».');
  para('4. Просрочка.', 'За просрочку платежа начисляется неустойка 0,1% от суммы просроченного платежа за каждый день.');

  doc.moveDown(0.4).font('bold').text('Приложение № 1. График платежей').moveDown(0.4).font('regular');
  const x = doc.page.margins.left;
  const cols = [x, x + 40, x + 200];
  const row = (cells: string[], bold = false) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 20) doc.addPage();
    const y = doc.y;
    doc.font(bold ? 'bold' : 'regular');
    doc.text(cells[0], cols[0], y, { width: 36 });
    doc.text(cells[1], cols[1], y, { width: 150 });
    doc.text(cells[2], cols[2], y, { width: 120, align: 'right' });
    doc.x = x;
    doc.moveDown(0.25);
  };
  row(['№', 'Дата', 'Сумма'], true);
  row(['0', 'взнос', rub(down)]);
  installmentAmounts(deal).forEach((amount, i) => row([String(i + 1), date(addMonths(start, i + 1)), rub(amount)]));

  doc.moveDown(1).font('regular');
  if (deal.signature && signedAt) {
    doc.font('bold').text('Документ подписан простой электронной подписью').font('regular')
      .text(`Подписант: ${p?.fio ?? deal.clientName}, телефон ${deal.phone}`)
      .text(`Дата и время подписания: ${dateTime(signedAt)}`)
      .text(`Идентификатор подписи: ${deal.signature.id}`);
  } else {
    doc.text('Проект договора. Не подписан.');
  }

  doc.end();
  return done;
}
