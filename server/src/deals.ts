import { randomBytes, randomUUID } from 'node:crypto';

import type { DB } from './db.ts';
import type { PaymentStatus, Providers } from './providers.ts';
import type { Deal, DealEvent, Passport, PayMethod, Stage } from './types.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const SELLER = { seller: 'ООО «Альфа-Сделка»', city: 'Москва' };

type Row = Record<string, string | number | null>;

const json = <T>(v: unknown): T | undefined => (v == null ? undefined : (JSON.parse(String(v)) as T));

export const downAmount = (d: Pick<Deal, 'total' | 'downPct'>) => Math.round((d.total * d.downPct) / 100);

/** Interest-free installments: the remainder after the down payment split evenly, the last one absorbs rounding. */
export function installmentAmounts(d: Pick<Deal, 'total' | 'downPct' | 'term'>) {
  const rest = d.total - downAmount(d);
  const base = Math.floor(rest / d.term);
  return Array.from({ length: d.term }, (_, i) => (i < d.term - 1 ? base : rest - base * (d.term - 1)));
}

export type NewDeal = { clientName: string; phone: string; subject: string; total: number; downPct: number; term: number };

export class DealService {
  db: DB;
  providers: Providers;
  /** Public address of the web app; the bank sends the client back there after paying. */
  appUrl?: string;
  constructor(db: DB, providers: Providers, opts: { appUrl?: string } = {}) {
    this.db = db;
    this.providers = providers;
    this.appUrl = opts.appUrl?.replace(/\/$/, '');
  }

  // ---------- reading ----------

  private toDeal(r: Row): Deal {
    const paid = this.db
      .prepare(`SELECT n, at FROM payments WHERE deal_id = ? AND kind = 'installment' ORDER BY n`)
      .all(r.id as string) as { n: number; at: string }[];
    return {
      id: r.id as string, no: r.no as string, token: r.token as string, seller: r.seller as string, city: r.city as string,
      subject: r.subject as string, total: r.total as number, downPct: r.down_pct as number, term: r.term as number,
      clientName: r.client_name as string, phone: r.phone as string, stage: r.stage as Stage, createdAt: r.created_at as string,
      passport: json<Passport>(r.passport), faceMatch: (r.face_match as number | null) ?? undefined,
      signature: json(r.signature), downPayment: json(r.down_payment),
      installmentsPaid: paid.map((p) => ({ n: p.n, at: p.at })),
    };
  }

  list(): Deal[] {
    return (this.db.prepare('SELECT * FROM deals ORDER BY created_at DESC').all() as Row[]).map((r) => this.toDeal(r));
  }

  byId(id: string): Deal {
    const r = this.db.prepare('SELECT * FROM deals WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw new ApiError(404, 'Сделка не найдена');
    return this.toDeal(r);
  }

  byToken(token: string): Deal {
    const r = this.db.prepare('SELECT * FROM deals WHERE token = ?').get(token) as Row | undefined;
    if (!r) throw new ApiError(404, 'Ссылка на сделку недействительна');
    return this.toDeal(r);
  }

  events(id: string): DealEvent[] {
    return (this.db.prepare('SELECT at, type, data FROM events WHERE deal_id = ? ORDER BY id').all(id) as Row[]).map((e) => ({
      at: e.at as string, type: e.type as string, data: json(e.data) ?? null,
    }));
  }

  // ---------- writing ----------

  private log(id: string, type: string, data?: unknown) {
    this.db.prepare('INSERT INTO events (deal_id, at, type, data) VALUES (?, ?, ?, ?)').run(
      id, new Date().toISOString(), type, data === undefined ? null : JSON.stringify(data));
  }

  private set(id: string, fields: Record<string, string | number | null>) {
    const keys = Object.keys(fields);
    this.db.prepare(`UPDATE deals SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  }

  private requireStage(d: Deal, ...allowed: Stage[]) {
    if (!allowed.includes(d.stage)) throw new ApiError(409, 'Этот шаг сейчас недоступен. Обновите страницу сделки.');
  }

  create(n: NewDeal, opts: { id?: string; token?: string; createdAt?: string } = {}): Deal {
    if (!n.clientName?.trim() || !n.subject?.trim()) throw new ApiError(400, 'Укажите ФИО клиента и предмет сделки');
    if (String(n.phone ?? '').replace(/\D/g, '').length < 11) throw new ApiError(400, 'Укажите телефон клиента полностью');
    if (!Number.isInteger(n.total) || n.total <= 0) throw new ApiError(400, 'Стоимость должна быть целым числом рублей больше нуля');
    if (!Number.isInteger(n.downPct) || n.downPct < 0 || n.downPct > 100) throw new ApiError(400, 'Взнос указывается в процентах от 0 до 100');
    if (!Number.isInteger(n.term) || n.term < 1 || n.term > 120) throw new ApiError(400, 'Срок рассрочки от 1 до 120 месяцев');
    const count = (this.db.prepare('SELECT COUNT(*) AS c FROM deals').get() as { c: number }).c;
    const id = opts.id ?? randomUUID();
    const no = `Д-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    const token = opts.token ?? randomBytes(16).toString('base64url');
    this.db.prepare(`INSERT INTO deals (id, no, token, seller, city, subject, total, down_pct, term, client_name, phone, stage, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'invited', ?)`).run(
      id, no, token, SELLER.seller, SELLER.city, n.subject.trim(), n.total, n.downPct, n.term, n.clientName.trim(), n.phone.trim(),
      opts.createdAt ?? new Date().toISOString());
    this.log(id, 'created', n);
    void this.providers.sms.send(n.phone, `${SELLER.seller}: оформите сделку по ссылке, код приглашения ${token}`);
    return this.byId(id);
  }

  start(token: string) {
    const d = this.byToken(token);
    if (d.stage === 'invited') {
      this.set(d.id, { stage: 'phone' });
      this.log(d.id, 'started');
    }
    return this.byId(d.id);
  }

  private async sendCode(d: Deal, purpose: 'phone' | 'sign', phone: string, text: (code: string) => string) {
    const code = this.providers.sms.newCode();
    this.db.prepare(`INSERT OR REPLACE INTO codes (deal_id, purpose, code, expires_at, attempts) VALUES (?, ?, ?, ?, 0)`).run(
      d.id, purpose, code, new Date(Date.now() + CODE_TTL_MS).toISOString());
    await this.providers.sms.send(phone, text(code));
    this.log(d.id, `${purpose}_code_sent`, { phone });
  }

  private checkCode(d: Deal, purpose: 'phone' | 'sign', code: string) {
    const row = this.db.prepare('SELECT code, expires_at, attempts FROM codes WHERE deal_id = ? AND purpose = ?').get(d.id, purpose) as
      { code: string; expires_at: string; attempts: number } | undefined;
    if (!row) throw new ApiError(400, 'Сначала запросите код');
    if (row.attempts >= MAX_CODE_ATTEMPTS) throw new ApiError(429, 'Слишком много попыток. Запросите новый код.');
    if (new Date(row.expires_at) < new Date()) throw new ApiError(400, 'Код устарел. Запросите новый.');
    if (String(code).trim() !== row.code) {
      this.db.prepare('UPDATE codes SET attempts = attempts + 1 WHERE deal_id = ? AND purpose = ?').run(d.id, purpose);
      throw new ApiError(400, 'Код не подходит. Проверьте SMS и введите код ещё раз.');
    }
    this.db.prepare('DELETE FROM codes WHERE deal_id = ? AND purpose = ?').run(d.id, purpose);
  }

  async sendPhoneCode(token: string, phone: string) {
    const d = this.byToken(token);
    this.requireStage(d, 'phone');
    if (String(phone ?? '').replace(/\D/g, '').length < 11) throw new ApiError(400, 'Введите номер телефона полностью');
    this.set(d.id, { phone: phone.trim() });
    await this.sendCode(d, 'phone', phone, (c) => `Код подтверждения: ${c}`);
    return this.byId(d.id);
  }

  verifyPhone(token: string, code: string) {
    const d = this.byToken(token);
    this.requireStage(d, 'phone');
    this.checkCode(d, 'phone', code);
    this.set(d.id, { stage: 'documents' });
    this.log(d.id, 'phone_verified', { phone: d.phone });
    return this.byId(d.id);
  }

  async recognize(token: string, passportImage: Buffer | null, selfieImage: Buffer | null) {
    const d = this.byToken(token);
    this.requireStage(d, 'documents');
    const [passport, faceMatch] = await Promise.all([
      this.providers.kyc.recognizePassport(passportImage),
      this.providers.kyc.matchFace(passportImage, selfieImage),
    ]);
    this.set(d.id, { face_match: faceMatch });
    this.log(d.id, 'kyc_checked', { faceMatch, passportImage: !!passportImage, selfieImage: !!selfieImage });
    return { deal: this.byId(d.id), passport, faceMatch };
  }

  confirmPassport(token: string, p: Passport) {
    const d = this.byToken(token);
    this.requireStage(d, 'documents');
    if (d.faceMatch == null) throw new ApiError(400, 'Сначала загрузите фото паспорта и селфи');
    if (d.faceMatch < 80) throw new ApiError(400, 'Лицо на селфи не совпало с паспортом. Сделайте селфи ещё раз.');
    const keys: (keyof Passport)[] = ['fio', 'birth', 'series', 'issued', 'issuedAt', 'address'];
    if (keys.some((k) => !String(p?.[k] ?? '').trim())) throw new ApiError(400, 'Заполните все паспортные данные');
    const clean = Object.fromEntries(keys.map((k) => [k, String(p[k]).trim()])) as Passport;
    this.set(d.id, { passport: JSON.stringify(clean), client_name: clean.fio, stage: 'contract' });
    this.log(d.id, 'passport_confirmed', clean);
    return this.byId(d.id);
  }

  acceptContract(token: string) {
    const d = this.byToken(token);
    this.requireStage(d, 'contract');
    this.set(d.id, { stage: 'sign' });
    this.log(d.id, 'contract_accepted');
    return this.byId(d.id);
  }

  async sendSignCode(token: string) {
    const d = this.byToken(token);
    this.requireStage(d, 'sign');
    await this.sendCode(d, 'sign', d.phone, (c) => `Код для подписания договора № ${d.no}: ${c}. Никому его не сообщайте.`);
    return this.byId(d.id);
  }

  verifySign(token: string, code: string) {
    const d = this.byToken(token);
    this.requireStage(d, 'sign');
    this.checkCode(d, 'sign', code);
    const at = new Date();
    const signature = { id: `ПЭП-${d.no.slice(-4)}-${at.getTime().toString(36).toUpperCase()}`, at: at.toISOString() };
    this.set(d.id, { signature: JSON.stringify(signature), stage: 'pay' });
    this.log(d.id, 'signed', { ...signature, phone: d.phone });
    return this.byId(d.id);
  }

  /** Starts a payment. The test acquirer confirms at once; a real one returns a link to the bank page or SBP
   * and confirms later through the webhook or a status check. */
  async pay(token: string, what: 'down' | 'next', method: PayMethod): Promise<{ deal: Deal; payment: PaymentView }> {
    const d = this.byToken(token);
    if (method !== 'sbp' && method !== 'card') throw new ApiError(400, 'Выберите способ оплаты');
    const { amount, n } = this.duePayment(d, what);
    const order = {
      id: randomUUID(), deal_id: d.id, kind: what === 'down' ? 'down' : 'installment', n, amount, method,
      provider: this.providers.payments.name, provider_id: null, status: 'pending', url: null, created_at: new Date().toISOString(),
    };
    this.db.prepare(`INSERT INTO payment_orders (${Object.keys(order).join(', ')}) VALUES (${Object.keys(order).map(() => '?').join(', ')})`)
      .run(...Object.values(order));
    let started;
    try {
      started = await this.providers.payments.create({
        orderId: order.id, amount, method,
        description: `Сделка ${d.no}${n ? `, платёж ${n}` : ', первоначальный взнос'}`,
        returnUrl: this.appUrl ? `${this.appUrl}/client/cabinet?t=${encodeURIComponent(d.token)}` : undefined,
      });
    } catch (e) {
      this.db.prepare(`UPDATE payment_orders SET status = 'failed' WHERE id = ?`).run(order.id);
      this.log(d.id, 'payment_error', { orderId: order.id, error: String(e) });
      throw new ApiError(502, 'Банк не ответил. Попробуйте оплатить ещё раз через минуту.');
    }
    this.db.prepare('UPDATE payment_orders SET provider_id = ?, url = ? WHERE id = ?').run(started.providerId, started.url ?? null, order.id);
    this.log(d.id, 'payment_started', { orderId: order.id, kind: what, n, amount, method });
    this.applyStatus(order.id, started.status);
    return this.paymentView(d.token, order.id);
  }

  /** Current state of a payment; asks the acquirer directly while it is still pending. */
  async paymentStatus(token: string, orderId: string) {
    const o = this.order(orderId);
    if (!o || o.deal_id !== this.byToken(token).id) throw new ApiError(404, 'Платёж не найден');
    if (o.status === 'pending' && o.provider_id) {
      try {
        this.applyStatus(o.id as string, await this.providers.payments.check(o.provider_id as string));
      } catch {
        // The webhook will still deliver the result.
      }
    }
    return this.paymentView(token, orderId);
  }

  /** Webhook from the acquirer. Returns false when the signature is wrong. */
  handleNotification(body: unknown): boolean {
    const n = this.providers.payments.parseNotification(body);
    if (!n) return false;
    const o = this.order(n.orderId);
    if (!o) return true; // not ours or already removed: acknowledge so the bank stops retrying
    if (n.status === 'paid' && n.amount !== o.amount) {
      this.log(o.deal_id as string, 'payment_amount_mismatch', { orderId: o.id, expected: o.amount, got: n.amount });
      return true;
    }
    this.applyStatus(o.id as string, n.status);
    return true;
  }

  private order(id: string) {
    return this.db.prepare('SELECT * FROM payment_orders WHERE id = ?').get(id) as Row | undefined;
  }

  private paymentView(token: string, orderId: string) {
    const o = this.order(orderId)!;
    return { deal: this.byToken(token), payment: { id: o.id as string, status: o.status as PaymentStatus, url: (o.url as string | null) ?? undefined } };
  }

  private duePayment(d: Deal, what: 'down' | 'next') {
    if (what === 'down') {
      this.requireStage(d, 'pay');
      return { amount: downAmount(d), n: null };
    }
    this.requireStage(d, 'active');
    const n = d.installmentsPaid.length + 1;
    if (n > d.term) throw new ApiError(409, 'Рассрочка уже полностью оплачена');
    return { amount: installmentAmounts(d)[n - 1], n };
  }

  /** Moves a pending order to its final state once; a payment for something already paid is logged for a refund. */
  private applyStatus(orderId: string, status: PaymentStatus) {
    if (status === 'pending') return;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const o = this.order(orderId);
      if (!o || o.status !== 'pending') return this.db.exec('COMMIT');
      this.db.prepare('UPDATE payment_orders SET status = ? WHERE id = ?').run(status, orderId);
      const dealId = o.deal_id as string;
      if (status === 'failed') {
        this.log(dealId, 'payment_failed', { orderId });
        return this.db.exec('COMMIT');
      }
      const d = this.byId(dealId);
      const kind = o.kind as 'down' | 'installment';
      const stillDue = kind === 'down' ? d.stage === 'pay' : d.stage === 'active' && d.installmentsPaid.length + 1 === o.n;
      if (!stillDue) {
        this.log(dealId, 'payment_duplicate', { orderId, amount: o.amount, kind, n: o.n });
        return this.db.exec('COMMIT');
      }
      const at = new Date().toISOString();
      this.db.prepare('INSERT INTO payments (id, deal_id, kind, n, amount, method, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        orderId, dealId, kind, o.n, o.amount, o.method, at);
      if (kind === 'down') this.set(dealId, { down_payment: JSON.stringify({ at, method: o.method }), stage: 'active' });
      this.log(dealId, 'paid', { paymentId: orderId, kind: kind === 'down' ? 'down' : 'next', n: o.n, amount: o.amount, method: o.method });
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}

export type PaymentView = { id: string; status: PaymentStatus; url?: string };
