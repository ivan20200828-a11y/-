/**
 * External providers. Every one runs in test mode: SMS codes are fixed and never sent,
 * no money moves, identity is not really checked. Replace each object with a real
 * integration (SMS gateway, KYC/OCR service, payment acquirer with SBP) behind the same shape.
 */
import { randomUUID } from 'node:crypto';

import type { PayMethod, Passport } from './types.ts';

export const TEST_MODE = process.env.PROVIDERS_MODE !== 'live';

export type Providers = {
  sms: { send(phone: string, text: string): Promise<void>; newCode(): string };
  kyc: {
    recognizePassport(image: Buffer | null): Promise<Passport>;
    matchFace(passport: Buffer | null, selfie: Buffer | null): Promise<number>;
  };
  payments: { charge(amount: number, method: PayMethod, description: string): Promise<{ id: string; ok: boolean }> };
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
    async charge() {
      return { id: `test-${randomUUID()}`, ok: true };
    },
  },
};
