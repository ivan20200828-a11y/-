/**
 * Т-Касса (internet acquiring of Т-Банк), API v2: Init creates a payment, GetQr turns it into an SBP link,
 * the bank posts status changes to NotificationURL. Every request and notification is signed with Token:
 * SHA-256 of the root-level scalar values sorted by key, with the terminal password added as "Password".
 *
 * Matches the API as used by public SDKs (signature rules, GetQr PAYLOAD, "OK" reply to notifications);
 * still to be run against a test terminal of the bank before going live.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import type { PaymentProvider, PaymentStatus } from '../providers.ts';

export type TkassaConfig = {
  terminalKey: string;
  password: string;
  /** Public URL of this server, the bank posts notifications to {publicUrl}/api/payments/notify. */
  publicUrl: string;
  apiUrl?: string;
  fetch?: typeof fetch;
};

export function tkassaConfigFromEnv(env: NodeJS.ProcessEnv): TkassaConfig {
  const { TKASSA_TERMINAL_KEY: terminalKey, TKASSA_PASSWORD: password, PUBLIC_URL: publicUrl } = env;
  if (!terminalKey || !password || !publicUrl) {
    throw new Error('Для Т-Кассы нужны TKASSA_TERMINAL_KEY, TKASSA_PASSWORD и PUBLIC_URL');
  }
  return { terminalKey, password, publicUrl, apiUrl: env.TKASSA_API_URL };
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
