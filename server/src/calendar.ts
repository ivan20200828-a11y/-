import { installmentAmounts } from './deals.ts';
import { addMonths } from './schedule.ts';
import type { Deal } from './types.ts';

/** Text for an iCalendar value: backslash, semicolon, comma and line breaks escaped. */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 bytes continue on the next line after a space (RFC 5545), without splitting a letter. */
function fold(line: string) {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
    }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** 20261107: the Moscow calendar date of a moment. */
const ymd = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }).replace(/-/g, '');
const nextDay = (d: Date) => ymd(new Date(+d + 86400000));
const rub = (n: number) => `${new Intl.NumberFormat('ru-RU').format(n)} ₽`;

/**
 * The client's remaining installments as an .ics file: each payment an all-day event on its date with a reminder
 * at 10:00 the day before. Phones add it to their calendar in one tap.
 */
export function scheduleIcs(deal: Deal, appUrl?: string, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sdelka online//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(`Платежи по договору ${deal.no}`)}`];
  if (deal.signature && deal.stage === 'active') {
    const start = new Date(deal.signature.at);
    const amounts = installmentAmounts(deal);
    const paid = new Set(deal.installmentsPaid.map((p) => p.n));
    const link = appUrl ? `${appUrl}/client?t=${encodeURIComponent(deal.token)}` : '';
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    for (let n = 1; n <= deal.term; n++) {
      if (paid.has(n)) continue;
      const due = addMonths(start, n);
      const summary = `Платёж ${n} из ${deal.term}: ${rub(amounts[n - 1])}, ${deal.seller}`;
      lines.push('BEGIN:VEVENT', `UID:${deal.id}-${n}@sdelka`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(due)}`, `DTEND;VALUE=DATE:${nextDay(due)}`,
        `SUMMARY:${esc(summary)}`,
        `DESCRIPTION:${esc(`Договор ${deal.no}, ${deal.subject}.${link ? ` Оплатить: ${link}` : ''}`)}`,
        ...(link ? [`URL:${link}`] : []),
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`Завтра платёж ${rub(amounts[n - 1])}`)}`, 'TRIGGER:-PT14H', 'END:VALARM',
        'END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
