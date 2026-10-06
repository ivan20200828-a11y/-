import { randomBytes, randomUUID } from 'node:crypto';

import { CompanyService } from './company.ts';
import type { DB } from './db.ts';
import { ESIGN_AGREEMENT } from './esign.ts';
import { addMonths } from './schedule.ts';
import { testProviders, type PaymentStatus, type Providers } from './providers.ts';
import type { Deal, DealEvent, PaidBy, Passport, PayMethod, PayWhat, Stage } from './types.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const CODE_TTL_MS = 5 * 60 * 1000;
const SMS_PAUSE_MS = 30 * 1000;
const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const rubText = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;
const dayText = (d: Date) => d.toLocaleDateString('ru-RU');
const MAX_CODE_ATTEMPTS = 5;

type Row = Record<string, string | number | null>;

/** Picture format by its first bytes; phones send JPEG, the web picker may send PNG. */
const imageType = (b: Buffer) => (b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0x52 && b[8] === 0x57 ? 'image/webp' : 'image/jpeg');

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
  company: CompanyService;
  constructor(db: DB, providers: Providers, opts: { appUrl?: string } = {}) {
    this.db = db;
    this.providers = providers;
    this.company = new CompanyService(db);
    this.appUrl = opts.appUrl?.replace(/\/$/, '');
  }

  // ---------- reading ----------

  private toDeal(r: Row): Deal {
    const paid = this.db
      .prepare(`SELECT n, at, method FROM payments WHERE deal_id = ? AND kind = 'installment' ORDER BY n`)
      .all(r.id as string) as { n: number; at: string; method: PaidBy }[];
    return {
      id: r.id as string, no: r.no as string, token: r.token as string, seller: r.seller as string, city: r.city as string,
      subject: r.subject as string, total: r.total as number, downPct: r.down_pct as number, term: r.term as number,
      clientName: r.client_name as string, phone: r.phone as string, stage: r.stage as Stage, createdAt: r.created_at as string,
      passport: json<Passport>(r.passport), faceMatch: (r.face_match as number | null) ?? undefined,
      signature: json(r.signature), downPayment: json(r.down_payment), esignAgreement: json(r.esign_agreement), sellerDetails: json(r.seller_details),
      installmentsPaid: paid.map((p) => ({ n: p.n, at: p.at, method: p.method })),
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

  create(n: NewDeal, opts: { id?: string; token?: string; createdAt?: string } = {}, by?: string): Deal {
    if (!n.clientName?.trim() || !n.subject?.trim()) throw new ApiError(400, 'Укажите ФИО клиента и предмет сделки');
    if (String(n.phone ?? '').replace(/\D/g, '').length < 11) throw new ApiError(400, 'Укажите телефон клиента полностью');
    if (!Number.isInteger(n.total) || n.total <= 0) throw new ApiError(400, 'Стоимость должна быть целым числом рублей больше нуля');
    if (!Number.isInteger(n.downPct) || n.downPct < 0 || n.downPct > 100) throw new ApiError(400, 'Взнос указывается в процентах от 0 до 100');
    if (!Number.isInteger(n.term) || n.term < 1 || n.term > 120) throw new ApiError(400, 'Срок рассрочки от 1 до 120 месяцев');
    const count = (this.db.prepare('SELECT COUNT(*) AS c FROM deals').get() as { c: number }).c;
    const id = opts.id ?? randomUUID();
    const no = `Д-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    let token = opts.token ?? randomBytes(16).toString('base64url');
    while (!opts.token && token.startsWith('demo')) token = randomBytes(16).toString('base64url'); // "demo…" is kept for demo deals
    const seller = this.company.get();
    this.db.prepare(`INSERT INTO deals (id, no, token, seller, city, subject, total, down_pct, term, client_name, phone, stage, created_at, seller_details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'invited', ?, ?)`).run(
      id, no, token, seller.name, seller.city, n.subject.trim(), n.total, n.downPct, n.term, n.clientName.trim(), n.phone.trim(),
      opts.createdAt ?? new Date().toISOString(), JSON.stringify(seller));
    this.log(id, 'created', { ...n, ...(by ? { by } : {}) });
    // The deal exists either way; if the SMS fails, the manager sees it in the history and can resend or copy the link.
    this.sms(id, token, n.phone, this.inviteText(seller.name, token)).catch(() => {});
    return this.byId(id);
  }

  /** Address of the client's deal in the web app; null when the server does not know where the app lives. */
  inviteUrl(token: string) {
    return this.appUrl ? `${this.appUrl}/client?t=${encodeURIComponent(token)}` : null;
  }

  private inviteText(seller: string, token: string) {
    const url = this.inviteUrl(token);
    return url ? `${seller}: оформите сделку онлайн по ссылке ${url}` : `${seller}: оформите сделку в приложении, код приглашения ${token}`;
  }

  /** Sends the invitation SMS again, for a client who lost it or has not started. */
  async resendInvite(id: string, by?: string) {
    const d = this.byId(id);
    if (d.stage === 'active' || d.stage === 'cancelled') throw new ApiError(409, 'Сделка уже оформлена или отменена');
    this.throttleSms(d, 'invite_resent', 3);
    await this.sms(d.id, d.token, d.phone, this.inviteText(d.seller, d.token));
    this.log(d.id, 'invite_resent', by ? { by } : undefined);
    return d;
  }

  /** Cancels a deal that has not been paid yet; the client then sees that it was cancelled. */
  cancel(id: string, reason: string, by?: string) {
    const d = this.byId(id);
    if (d.stage === 'cancelled') return d;
    if (d.downPayment) throw new ApiError(409, 'По сделке уже есть оплата. Отмена оформляется через возврат денег.');
    if (!String(reason ?? '').trim()) throw new ApiError(400, 'Укажите причину отмены');
    this.set(d.id, { stage: 'cancelled' });
    this.db.prepare('DELETE FROM codes WHERE deal_id = ?').run(d.id);
    this.log(d.id, 'cancelled', { reason: reason.trim(), ...(by ? { by } : {}) });
    return this.byId(d.id);
  }

  /** Photos the client uploaded at verification, as data URLs for the manager's review. */
  kycImages(id: string) {
    this.byId(id);
    const rows = this.db.prepare('SELECT kind, mime, data, at FROM kyc_images WHERE deal_id = ?').all(id) as
      { kind: string; mime: string; data: Uint8Array; at: string }[];
    return Object.fromEntries(rows.map((r) => [r.kind, { url: `data:${r.mime};base64,${Buffer.from(r.data).toString('base64')}`, at: r.at }]));
  }

  start(token: string) {
    const d = this.byToken(token);
    if (d.stage === 'invited') {
      this.set(d.id, { stage: 'phone' });
      this.log(d.id, 'started');
    }
    return this.byId(d.id);
  }

  /** Demo deals (made by the seed for trying the app out) never send real SMS, and their code stays 1234. */
  private smsFor(token: string) {
    return token.startsWith('demo') ? testProviders.sms : this.providers.sms;
  }

  /** Sends an SMS; a gateway failure is logged on the deal and reported to the person as a readable error. */
  private async sms(dealId: string, token: string, phone: string, text: string) {
    try {
      await this.smsFor(token).send(phone, text);
    } catch (e) {
      this.log(dealId, 'sms_failed', { phone, error: String((e as Error).message ?? e) });
      throw new ApiError(502, 'Не получилось отправить SMS. Попробуйте ещё раз через минуту.');
    }
  }

  /** SMS cost money and can be used to pester someone: a pause between sends and a cap per hour, per deal. */
  private throttleSms(d: Deal, type: string, perHour: number) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const sent = this.db.prepare('SELECT at FROM events WHERE deal_id = ? AND type = ? AND at > ? ORDER BY at DESC').all(d.id, type, since) as { at: string }[];
    if (sent.length >= perHour) throw new ApiError(429, 'Слишком много SMS за час. Попробуйте позже или свяжитесь с менеджером.');
    const wait = sent.length ? Math.ceil((+new Date(sent[0].at) + SMS_PAUSE_MS - Date.now()) / 1000) : 0;
    if (wait > 0) throw new ApiError(429, `Новое SMS можно запросить через ${wait} с.`);
  }

  private async sendCode(d: Deal, purpose: 'phone' | 'sign', phone: string, text: (code: string) => string) {
    this.throttleSms(d, `${purpose}_code_sent`, 5);
    const code = this.smsFor(d.token).newCode();
    this.db.prepare(`INSERT OR REPLACE INTO codes (deal_id, purpose, code, expires_at, attempts) VALUES (?, ?, ?, ?, 0)`).run(
      d.id, purpose, code, new Date(Date.now() + CODE_TTL_MS).toISOString());
    await this.sms(d.id, d.token, phone, text(code));
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
    const at = new Date().toISOString();
    for (const [kind, img] of [['passport', passportImage], ['selfie', selfieImage]] as const) {
      if (img) this.db.prepare('INSERT OR REPLACE INTO kyc_images (deal_id, kind, mime, data, at) VALUES (?, ?, ?, ?, ?)')
        .run(d.id, kind, imageType(img), img, at);
    }
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

  /** The client has read the contract and accepted the agreement on the simple electronic signature. */
  acceptContract(token: string, esignEdition: number) {
    const d = this.byToken(token);
    this.requireStage(d, 'contract');
    if (esignEdition !== ESIGN_AGREEMENT.edition) {
      throw new ApiError(400, 'Примите соглашение о простой электронной подписи, чтобы подписать договор');
    }
    const esign = { edition: ESIGN_AGREEMENT.edition, at: new Date().toISOString() };
    this.set(d.id, { stage: 'sign', esign_agreement: JSON.stringify(esign) });
    this.log(d.id, 'esign_agreement_accepted', esign);
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

  /** SMS reminders: three days before an installment is due, and once it is missed. Each one goes out once. */
  async sendReminders(now = new Date()) {
    const sent: { dealId: string; type: string; n: number }[] = [];
    for (const d of this.list()) {
      if (d.stage !== 'active' || !d.signature) continue;
      const n = d.installmentsPaid.length + 1;
      if (n > d.term) continue;
      const due = addMonths(new Date(d.signature.at), n);
      const daysLeft = Math.round((+startOfDay(due) - +startOfDay(now)) / DAY);
      const type = daysLeft < 0 ? 'reminder_overdue' : daysLeft <= 3 ? 'reminder_soon' : null;
      if (!type) continue;
      const already = this.db
        .prepare(`SELECT 1 FROM events WHERE deal_id = ? AND type = ? AND json_extract(data, '$.n') = ?`)
        .get(d.id, type, n);
      if (already) continue;
      const amount = installmentAmounts(d)[n - 1];
      const link = this.appUrl ? ` Оплатить: ${this.appUrl}/client?t=${encodeURIComponent(d.token)}` : '';
      const text = type === 'reminder_soon'
        ? `${d.seller}: платёж ${n} по договору ${d.no} на ${rubText(amount)} до ${dayText(due)}.${link}`
        : `${d.seller}: платёж ${n} по договору ${d.no} на ${rubText(amount)} просрочен с ${dayText(due)}. Пожалуйста, оплатите.${link}`;
      try {
        await this.sms(d.id, d.token, d.phone, text);
      } catch {
        continue; // not marked as sent, so the next hourly run tries again
      }
      this.log(d.id, type, { n, amount, due: due.toISOString() });
      sent.push({ dealId: d.id, type, n });
    }
    return sent;
  }

  /** Starts a payment. The test acquirer confirms at once; a real one returns a link to the bank page or SBP
   * and confirms later through the webhook or a status check. */
  async pay(token: string, what: PayWhat, method: PayMethod): Promise<{ deal: Deal; payment: PaymentView }> {
    const d = this.byToken(token);
    if (method !== 'sbp' && method !== 'card') throw new ApiError(400, 'Выберите способ оплаты');
    const order = this.newOrder(d, what, method, this.providers.payments.name);
    const { amount, n } = order;
    let started;
    try {
      started = await this.providers.payments.create({
        orderId: order.id, amount, method,
        description: `Сделка ${d.no}, ${paymentTitle(what, n)}`,
        receipt: { item: d.subject, phone: d.phone, part: what === 'down' ? 'down' : 'installment', final: what === 'rest' || n === d.term },
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

  /** A payment received outside the app (bank transfer by the requisites, cash at the office), marked by a manager. */
  recordManual(id: string, b: { what: PayWhat; method: PaidBy; note?: string }, by?: string) {
    const d = this.byId(id);
    if (b.method !== 'transfer' && b.method !== 'cash') throw new ApiError(400, 'Укажите, как получены деньги: переводом или наличными');
    const note = (b.note ?? '').trim().slice(0, 200);
    const order = this.newOrder(d, b.what, b.method, 'manual');
    this.applyStatus(order.id, 'paid', { by, note: note || undefined });
    return this.byId(id);
  }

  private newOrder(d: Deal, what: PayWhat, method: PaidBy, provider: string) {
    const { amount, n } = this.duePayment(d, what);
    const order = {
      id: randomUUID(), deal_id: d.id, kind: what === 'down' ? 'down' : what === 'rest' ? 'rest' : 'installment', n, amount, method,
      provider, provider_id: null, status: 'pending', url: null, created_at: new Date().toISOString(),
    };
    this.db.prepare(`INSERT INTO payment_orders (${Object.keys(order).join(', ')}) VALUES (${Object.keys(order).map(() => '?').join(', ')})`)
      .run(...Object.values(order));
    return order;
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

  private duePayment(d: Deal, what: PayWhat) {
    if (what === 'down') {
      this.requireStage(d, 'pay');
      return { amount: downAmount(d), n: null };
    }
    if (what !== 'next' && what !== 'rest') throw new ApiError(400, 'Непонятно, что оплачивается');
    this.requireStage(d, 'active');
    const n = d.installmentsPaid.length + 1;
    if (n > d.term) throw new ApiError(409, 'Рассрочка уже полностью оплачена');
    const amounts = installmentAmounts(d);
    return { amount: what === 'rest' ? amounts.slice(n - 1).reduce((a, x) => a + x, 0) : amounts[n - 1], n };
  }

  /** Moves a pending order to its final state once; a payment for something already paid is logged for a refund. */
  private applyStatus(orderId: string, status: PaymentStatus, manual?: { by?: string; note?: string }) {
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
      const kind = o.kind as 'down' | 'installment' | 'rest';
      const stillDue = kind === 'down' ? d.stage === 'pay' : d.stage === 'active' && d.installmentsPaid.length + 1 === o.n;
      if (!stillDue) {
        this.log(dealId, 'payment_duplicate', { orderId, amount: o.amount, kind, n: o.n });
        return this.db.exec('COMMIT');
      }
      const at = new Date().toISOString();
      const insert = this.db.prepare('INSERT INTO payments (id, deal_id, kind, n, amount, method, at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      if (kind === 'rest') {
        // Early repayment closes every remaining installment; each gets its own row so schedules and exports stay per installment.
        const amounts = installmentAmounts(d);
        for (let n = o.n as number; n <= d.term; n++) insert.run(`${orderId}:${n}`, dealId, 'installment', n, amounts[n - 1], o.method, at);
      } else {
        insert.run(orderId, dealId, kind, o.n, o.amount, o.method, at);
      }
      if (kind === 'down') this.set(dealId, { down_payment: JSON.stringify({ at, method: o.method }), stage: 'active' });
      this.log(dealId, 'paid', {
        paymentId: orderId, kind: kind === 'down' ? 'down' : kind === 'rest' ? 'rest' : 'next', n: o.n, amount: o.amount, method: o.method,
        ...(manual?.by ? { by: manual.by } : {}), ...(manual?.note ? { note: manual.note } : {}),
      });
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}

export type PaymentView = { id: string; status: PaymentStatus; url?: string };

const paymentTitle = (what: PayWhat, n: number | null) =>
  what === 'down' ? 'первоначальный взнос' : what === 'rest' ? `досрочное погашение с платежа ${n}` : `платёж ${n}`;
