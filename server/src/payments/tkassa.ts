/**
 * Т-Касса (internet acquiring of Т-Банк), API v2: Init creates a payment, GetQr turns it into an SBP link,
 * the bank posts status changes to NotificationURL. Every request and notification is signed with Token:
 * SHA-256 of the root-level scalar values sorted by key, with the terminal password added as "Password".
 *
 * Matches the API as used by public SDKs (signature rules, GetQr PAYLOAD, "OK" reply to notifications);
 * still to be run against a test terminal of the bank before going live.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import type { PaymentOrder, PaymentProvider, PaymentStatus } from '../providers.ts';

/** Fiscal receipts (54-ФЗ) through the bank's online cash register. The accountant picks these values. */
export type ReceiptConfig = {
  taxation: 'osn' | 'usn_income' | 'usn_income_outcome' | 'esn' | 'patent';
  tax: 'none' | 'vat0' | 'vat5' | 'vat7' | 'vat10' | 'vat20' | 'vat22';
  /** When the goods pass to the buyer: at signing (sale on credit) or after the last payment (prepayments). */
  handover: 'signing' | 'full_payment';
  ffd: '1.05' | '1.2';
};

export type TkassaConfig = {
  terminalKey: string;
  password: string;
  /** Public URL of this server, the bank posts notifications to {publicUrl}/api/payments/notify. */
  publicUrl: string;
  apiUrl?: string;
  /** Without it no receipt is sent with the payment. */
  receipts?: ReceiptConfig;
  fetch?: typeof fetch;
};

export function tkassaConfigFromEnv(env: NodeJS.ProcessEnv): TkassaConfig {
  const { TKASSA_TERMINAL_KEY: terminalKey, TKASSA_PASSWORD: password, PUBLIC_URL: publicUrl } = env;
  if (!terminalKey || !password || !publicUrl) {
    throw new Error('Для Т-Кассы нужны TKASSA_TERMINAL_KEY, TKASSA_PASSWORD и PUBLIC_URL');
  }
  const receipts = env.TKASSA_TAXATION
    ? {
        taxation: env.TKASSA_TAXATION as ReceiptConfig['taxation'],
        tax: (env.TKASSA_TAX ?? 'none') as ReceiptConfig['tax'],
        handover: (env.TKASSA_HANDOVER === 'full_payment' ? 'full_payment' : 'signing') as ReceiptConfig['handover'],
        ffd: (env.TKASSA_FFD === '1.05' ? '1.05' : '1.2') as ReceiptConfig['ffd'],
      }
    : undefined;
  return { terminalKey, password, publicUrl, apiUrl: env.TKASSA_API_URL, receipts };
}

/**
 * The receipt for one payment, as a single line for the whole amount. Goods handed over at signing are a sale on
 * credit: the down payment is "частичный расчёт и кредит", later payments are "оплата кредита". Goods handed over
 * after the last payment: earlier payments are "частичная предоплата", the last one is "полный расчёт".
 */
export function tkassaReceipt(order: PaymentOrder, cfg: ReceiptConfig) {
  const r = order.receipt!;
  const amount = order.amount * 100;
  const [method, object] = cfg.handover === 'signing'
    ? r.part === 'down' ? ['partial_payment', 'commodity'] : ['credit_payment', 'payment']
    : r.final ? ['full_payment', 'commodity'] : ['prepayment', 'commodity'];
  const digits = r.phone.replace(/\D/g, '');
  return {
    FfdVersion: cfg.ffd,
    Taxation: cfg.taxation,
    Phone: `+${digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits}`,
    Items: [{
      Name: r.item.slice(0, 128),
      Price: amount,
      Quantity: 1,
      Amount: amount,
      Tax: cfg.tax,
      PaymentMethod: method,
      PaymentObject: object,
      ...(cfg.ffd === '1.2' ? { MeasurementUnit: 'шт' } : {}),
    }],
  };
}

type Params = Record<string, unknown>;

export function tkassaToken(params: Params, password: string): string {
  const values: Params = { ...params, Password: password };
  delete values.Token;
  const joined = Object.keys(values)
    .filter((k) => values[k] !== null && values[k] !== undefined && typeof values[k] !== 'object')
    .sort()
    .map((k) => String(values[k]))
    .join('');
  return createHash('sha256').update(joined).digest('hex');
}

const FAILED = new Set(['REJECTED', 'CANCELED', 'DEADLINE_EXPIRED', 'AUTH_FAIL', 'REVERSED', 'REFUNDED', 'PARTIAL_REFUNDED']);
const toStatus = (s: unknown): PaymentStatus => (s === 'CONFIRMED' ? 'paid' : FAILED.has(String(s)) ? 'failed' : 'pending');

export function tkassa(cfg: TkassaConfig): PaymentProvider {
  const api = (cfg.apiUrl ?? 'https://securepay.tinkoff.ru/v2').replace(/\/$/, '');
  const doFetch = cfg.fetch ?? fetch;

  async function call(method: string, params: Params): Promise<Params> {
    const body = { TerminalKey: cfg.terminalKey, ...params };
    const res = await doFetch(`${api}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, Token: tkassaToken(body, cfg.password) }),
    });
    const data = (await res.json()) as Params;
    if (!res.ok || data.Success !== true) {
      throw new Error(`Т-Касса ${method}: ${data.ErrorCode ?? res.status} ${data.Message ?? ''} ${data.Details ?? ''}`.trim());
    }
    return data;
  }

  return {
    name: 'tkassa',
    async create(order) {
      const init = await call('Init', {
        Amount: order.amount * 100,
        OrderId: order.orderId,
        Description: order.description.slice(0, 140),
        NotificationURL: `${cfg.publicUrl.replace(/\/$/, '')}/api/payments/notify`,
        ...(order.returnUrl ? { SuccessURL: order.returnUrl, FailURL: order.returnUrl } : {}),
        // Nested objects are left out of the Token, so the receipt does not change the signature.
        ...(cfg.receipts && order.receipt ? { Receipt: tkassaReceipt(order, cfg.receipts) } : {}),
      });
      const providerId = String(init.PaymentId);
      let url = init.PaymentURL as string | undefined;
      if (order.method === 'sbp') {
        // A link to the National Payment Card System page: opens the bank app on a phone, shows a QR code on a computer.
        const qr = await call('GetQr', { PaymentId: providerId, DataType: 'PAYLOAD' });
        url = qr.Data as string;
      }
      return { providerId, status: toStatus(init.Status), url };
    },
    async check(providerId) {
      return toStatus((await call('GetState', { PaymentId: providerId })).Status);
    },
    parseNotification(body) {
      if (!body || typeof body !== 'object') return null;
      const n = body as Params;
      if (n.TerminalKey !== cfg.terminalKey || typeof n.Token !== 'string') return null;
      const expected = Buffer.from(tkassaToken(n, cfg.password));
      const got = Buffer.from(n.Token.toLowerCase());
      if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
      return {
        orderId: String(n.OrderId),
        providerId: String(n.PaymentId),
        status: n.Success === false ? 'failed' : toStatus(n.Status),
        amount: Number(n.Amount) / 100,
      };
    },
    notificationAck: 'OK',
  };
}
