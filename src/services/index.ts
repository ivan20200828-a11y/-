/**
 * Provider boundaries. Everything here runs in test mode: no SMS is sent, no money moves,
 * no identity is checked. Each object is the seam where a real provider plugs in
 * (an SMS gateway, a KYC/OCR service, an e-signature operator, a payment acquirer with SBP).
 */
import type { Passport, PayMethod } from '@/state/types';

export const TEST_MODE = true;
export const TEST_CODE = '1234';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const sms = {
  async sendCode(_phone: string) {
    await wait(400);
    return { requestId: `sms-${Date.now()}` };
  },
  async verify(_requestId: string, code: string) {
    await wait(300);
    return code.trim() === TEST_CODE;
  },
};

const SAMPLE_PASSPORT: Passport = {
  fio: 'Смирнов Алексей Петрович',
  birth: '14.03.1988',
  series: '4512 873450',
  issued: 'ГУ МВД России по г. Москве',
  issuedAt: '22.04.2018',
  address: 'г. Москва, ул. Профсоюзная, д. 56, кв. 112',
};

export const kyc = {
  /** Reads the passport main spread. In test mode returns sample data whatever the photo. */
  async recognizePassport(_imageUri: string | null): Promise<Passport> {
    await wait(1200);
    return { ...SAMPLE_PASSPORT };
  },
  /** Compares the selfie with the passport photo; returns similarity in percent. */
  async matchFace(_passportUri: string | null, _selfieUri: string | null) {
    await wait(400);
    return 97;
  },
};

export const esign = {
  /** Simple electronic signature (ПЭП) confirmed by an SMS code. */
  async sign(dealId: string, code: string) {
    await wait(500);
    if (code.trim() !== TEST_CODE) return null;
    const at = new Date();
    return { id: `ПЭП-${dealId.slice(-4)}-${at.getTime().toString(36).toUpperCase()}`, at };
  },
};

export const payments = {
  async pay(_amount: number, _method: PayMethod) {
    await wait(1200);
    return { id: `pay-${Date.now()}`, at: new Date(), ok: true as const };
  },
};
