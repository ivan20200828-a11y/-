import { randomBytes } from 'node:crypto';

import type { DB } from './db.ts';
import { ApiError, downAmount, installmentAmounts, type DealService } from './deals.ts';
import { addMonths } from './schedule.ts';

const KEY_TTL_MS = 5 * 60 * 1000;
const STAGE: Record<string, string> = {
  invited: 'Приглашение отправлено', phone: 'Подтверждает телефон', documents: 'Верификация', contract: 'Изучает договор',
  sign: 'Ждёт подписания', pay: 'Ждёт оплаты взноса', active: 'Платежи по графику', cancelled: 'Отменена',
};

/** A CSV that Excel opens correctly in Russian: UTF-8 with BOM, semicolons, CRLF. */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

const day = (iso: string | Date) => new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });

/**
 * Spreadsheets for accounting. A browser download cannot carry the manager's Authorization header,
 * so the app first asks for a one-time key valid for five minutes and opens the file with it.
 */
export class ExportService {
  private keys = new Map<string, number>();
  db: DB;
  deals: DealService;
  constructor(db: DB, deals: DealService) {
    this.db = db;
    this.deals = deals;
  }

  newKey() {
    const key = randomBytes(24).toString('base64url');
    this.keys.set(key, Date.now() + KEY_TTL_MS);
    return key;
  }

  useKey(key: string) {
    const until = this.keys.get(key);
    this.keys.delete(key);
    if (!until || until < Date.now()) throw new ApiError(401, 'Ссылка на выгрузку устарела. Нажмите «Выгрузить» ещё раз.');
  }

  /** One row per payment; an early repayment shows as several installments with the same operation number. */
  payments() {
    const rows = this.db.prepare(`SELECT p.*, d.no, d.client_name, d.phone FROM payments p JOIN deals d ON d.id = p.deal_id ORDER BY p.at`).all() as
      { id: string; kind: string; n: number | null; amount: number; method: string; at: string; no: string; client_name: string; phone: string }[];
    return toCsv([
      ['Дата', 'Договор', 'Клиент', 'Телефон', 'Платёж', 'Сумма, ₽', 'Способ', 'Номер операции'],
      ...rows.map((r) => [day(r.at), r.no, r.client_name, r.phone, r.kind === 'down' ? 'Первоначальный взнос' : `Платёж ${r.n}`,
        r.amount, METHOD[r.method] ?? r.method, r.id.split(':')[0]]),
    ]);
  }

  dealsTable(now = new Date()) {
    return toCsv([
      ['Договор', 'Создана', 'Клиент', 'Телефон', 'Предмет', 'Стоимость, ₽', 'Взнос, ₽', 'Срок, мес.', 'Этап', 'Оплачено, ₽', 'Остаток, ₽',
        'Следующий платёж', 'Сумма следующего, ₽', 'Просрочено, ₽'],
      ...this.deals.list().map((d) => {
        const amounts = installmentAmounts(d);
        const paidN = new Set(d.installmentsPaid.map((p) => p.n));
        const paid = (d.downPayment ? downAmount(d) : 0) + amounts.filter((_, i) => paidN.has(i + 1)).reduce((a, b) => a + b, 0);
        const start = d.signature ? new Date(d.signature.at) : null;
        const nextN = d.stage === 'active' ? amounts.findIndex((_, i) => !paidN.has(i + 1)) + 1 : 0;
        const overdue = start && d.stage === 'active'
          ? amounts.reduce((a, amt, i) => (!paidN.has(i + 1) && addMonths(start, i + 1) < now ? a + amt : a), 0)
          : 0;
        return [d.no, day(d.createdAt), d.clientName, d.phone, d.subject, d.total, downAmount(d), d.term, STAGE[d.stage] ?? d.stage,
          paid, d.stage === 'cancelled' ? 0 : d.total - paid,
          nextN > 0 && start ? day(addMonths(start, nextN)) : '', nextN > 0 ? amounts[nextN - 1] : '', overdue || ''];
      }),
    ]);
  }
}

const METHOD: Record<string, string> = { sbp: 'СБП', card: 'Карта', transfer: 'Перевод по реквизитам', cash: 'Наличные' };
