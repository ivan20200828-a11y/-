/**
 * SMSC.ru: one HTTPS call per message to /sys/send.php with fmt=3 (JSON reply). A reply with error_code means
 * the message was not accepted (wrong password, no money on the balance, unknown sender name).
 */
import { randomInt } from 'node:crypto';

import type { SmsProvider } from '../providers.ts';

export type SmscConfig = { login: string; password: string; sender?: string; apiUrl?: string; fetch?: typeof fetch };

export function smscConfigFromEnv(env: NodeJS.ProcessEnv): SmscConfig {
  const { SMSC_LOGIN: login, SMSC_PASSWORD: password, SMSC_SENDER: sender } = env;
  if (!login || !password) throw new Error('Для SMSC.ru нужны SMSC_LOGIN и SMSC_PASSWORD');
  return { login, password, sender: sender || undefined, apiUrl: env.SMSC_API_URL };
}

/** "+7 (900) 123-45-67" and "8 900 123 45 67" both become "79001234567". */
export function smscPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('8') ? `7${digits.slice(1)}` : digits;
}

export function smsc(cfg: SmscConfig): SmsProvider {
  const url = `${(cfg.apiUrl ?? 'https://smsc.ru').replace(/\/$/, '')}/sys/send.php`;
  const doFetch = cfg.fetch ?? fetch;
  return {
    name: 'smsc',
    newCode: () => String(randomInt(1000, 10000)),
    async send(phone, text) {
      const form = new URLSearchParams({ login: cfg.login, psw: cfg.password, phones: smscPhone(phone), mes: text, fmt: '3', charset: 'utf-8' });
      if (cfg.sender) form.set('sender', cfg.sender);
      const res = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
      const data = (await res.json().catch(() => ({}))) as { id?: number; error?: string; error_code?: number };
      if (!res.ok || data.error_code) throw new Error(`SMSC.ru: ${data.error_code ?? res.status} ${data.error ?? ''}`.trim());
    },
  };
}
