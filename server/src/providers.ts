/**
 * External providers. Every one runs in test mode: SMS codes are fixed and never sent,
 * no money moves, identity is not really checked. Replace each object with a real
 * integration (SMS gateway, KYC/OCR service, payment acquirer with SBP) behind the same shape.
 */
import { randomUUID } from 'node:crypto';

import { tkassa, tkassaConfigFromEnv } from './payments/tkassa.ts';
import type { PayMethod, Passport } from './types.ts';

export const TEST_MODE = process.env.PROVIDERS_MODE !== 'live';

export type Providers = {
  sms: { send(phone: string, text: string): Promise<void>; newCode(): string };
  kyc: {
    recognizePassport(image: Buffer | null): Promise<Passport>;
    matchFace(passport: Buffer | null, selfie: Buffer | null): Promise<number>;
  };
  payments: PaymentProvider;
};

export type PaymentStatus = 'pending' | 'paid' | 'failed';

/** What the deal asks the acquirer to collect. Amounts are whole rubles. */
export type PaymentOrder = { orderId: string; amount: number; method: PayMethod; description: string; returnUrl?: string };

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
    async send(phone, text) {
      console.log(`[sms:test] ${phone}: ${text}`);
    },
    newCode: () => '1234',
  },
  kyc: {
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

/** Test SMS and KYC; payments go through Т-Касса when PAYMENTS_PROVIDER=tkassa. */
export function providersFromEnv(env = process.env): Providers {
  if (env.PAYMENTS_PROVIDER === 'tkassa') return { ...testProviders, payments: tkassa(tkassaConfigFromEnv(env)) };
  return testProviders;
}
