/**
 * External providers. Each one runs in test mode until configured: SMS codes are fixed and never sent,
 * no money moves, identity is not really checked. Real integrations sit behind the same shapes and are
 * switched on one by one from the environment (SMS_PROVIDER, PAYMENTS_PROVIDER).
 */
import { randomUUID } from 'node:crypto';

import { tkassa, tkassaConfigFromEnv } from './payments/tkassa.ts';
import { smsc, smscConfigFromEnv } from './sms/smsc.ts';
import type { PayMethod, Passport } from './types.ts';

export type SmsProvider = { name: string; send(phone: string, text: string): Promise<void>; newCode(): string };

export type Providers = {
  sms: SmsProvider;
  kyc: {
    name: string;
    recognizePassport(image: Buffer | null): Promise<Passport>;
    matchFace(passport: Buffer | null, selfie: Buffer | null): Promise<number>;
  };
  payments: PaymentProvider;
};

export type PaymentStatus = 'pending' | 'paid' | 'failed';

/** What the deal asks the acquirer to collect. Amounts are whole rubles. */
export type PaymentOrder = {
  orderId: string; amount: number; method: PayMethod; description: string; returnUrl?: string;
  /** What the fiscal receipt (54-ФЗ) describes: the goods, the buyer's phone, which part of the price is paid. */
  receipt?: { item: string; phone: string; part: 'down' | 'installment'; final: boolean };
};

/** An acquirer. Payments are confirmed asynchronously: the client pays on the bank's page or in the bank app
 * (SBP), then the acquirer calls our webhook. `check` asks for the status directly in case the webhook is late. */
export type PaymentProvider = {
  name: string;
  create(order: PaymentOrder): Promise<{ providerId: string; status: PaymentStatus; url?: string }>;
  check(providerId: string): Promise<PaymentStatus>;
  /** Verifies a webhook call; null when the signature does not match. */
  parseNotification(body: unknown): { orderId: string; providerId: string; status: PaymentStatus; amount: number } | null;
  /** Body the acquirer expects back from the webhook. */
  notificationAck: string;
};

export const testProviders: Providers = {
  sms: {
    name: 'test',
    async send(phone, text) {
      console.log(`[sms:test] ${phone}: ${text}`);
    },
    newCode: () => '1234',
  },
  kyc: {
    name: 'test',
    async recognizePassport() {
      return {
        fio: 'Смирнов Алексей Петрович',
        birth: '14.03.1988',
        series: '4512 873450',
        issued: 'ГУ МВД России по г. Москве',
        issuedAt: '22.04.2018',
        address: 'г. Москва, ул. Профсоюзная, д. 56, кв. 112',
      };
    },
    async matchFace() {
      return 97;
    },
  },
  payments: {
    name: 'test',
    async create() {
      return { providerId: `test-${randomUUID()}`, status: 'paid' };
    },
    async check() {
      return 'paid';
    },
    parseNotification: () => null,
    notificationAck: 'OK',
  },
};

/** Test providers, with SMS through SMSC.ru when SMS_PROVIDER=smsc and payments through Т-Касса when PAYMENTS_PROVIDER=tkassa. */
export function providersFromEnv(env = process.env): Providers {
  return {
    ...testProviders,
    ...(env.SMS_PROVIDER === 'smsc' ? { sms: smsc(smscConfigFromEnv(env)) } : {}),
    ...(env.PAYMENTS_PROVIDER === 'tkassa' ? { payments: tkassa(tkassaConfigFromEnv(env)) } : {}),
  };
}

/** Which parts still run in test mode; the app shows a banner while any do. */
export const testParts = (p: Providers) =>
  (['sms', 'kyc', 'payments'] as const).filter((k) => p[k].name === 'test');
