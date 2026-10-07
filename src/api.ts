import { session } from '@/lib/session';
import type { Company, Deal, PaidBy, Passport, PayMethod, PayWhat } from '@/state/types';

/** Server address. Set EXPO_PUBLIC_API_URL when the server runs elsewhere (a phone cannot reach "localhost" on your computer). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export type TestPart = 'sms' | 'kyc' | 'payments';

let testParts: Promise<TestPart[]> | null = null;
/** Which services the server still imitates (SMS, identity check, payments); asked once per app start. */
export function serverTestParts() {
  testParts ??= fetch(`${API_URL}/api/health`)
    .then((r) => r.json())
    .then((h: { test?: TestPart[] }) => h.test ?? [])
    .catch(() => { testParts = null; return []; });
  return testParts;
}

type WireDeal = Omit<Deal, 'createdAt' | 'signature' | 'downPayment' | 'esignAgreement' | 'installmentsPaid'> & {
  createdAt: string;
  esignAgreement?: { edition: number; at: string };
  signature?: { id: string; at: string };
  downPayment?: { at: string; method: PaidBy };
  installmentsPaid: { n: number; at: string; method: PaidBy }[];
};

export type DealEvent = { at: Date; type: string; data: unknown };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

export type Manager = { id: number; email: string; name: string; admin: boolean; disabled: boolean; knownPassword?: boolean };

function hydrate(d: WireDeal): Deal {
  return {
    ...d,
    createdAt: new Date(d.createdAt),
    signature: d.signature && { ...d.signature, at: new Date(d.signature.at) },
    downPayment: d.downPayment && { ...d.downPayment, at: new Date(d.downPayment.at) },
    esignAgreement: d.esignAgreement && { ...d.esignAgreement, at: new Date(d.esignAgreement.at) },
    installmentsPaid: d.installmentsPaid.map((p) => ({ ...p, at: new Date(p.at) })),
  };
}

async function call<T>(path: string, init: { method?: string; body?: unknown; manager?: boolean } = {}): Promise<T> {
  const token = init.manager ? await session.get() : null;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'Не получилось выполнить действие. Попробуйте ещё раз.', res.status);
  return data as T;
}

export const authApi = {
  login: async (email: string, password: string) => {
    const r = await call<{ token: string; manager: Manager }>('/api/auth/login', { body: { email, password } });
    await session.set(r.token);
    return r.manager;
  },
  me: async () => (await call<{ manager: Manager }>('/api/auth/me', { manager: true })).manager,
  changePassword: async (current: string, next: string) => {
    await call('/api/auth/password', { body: { current, next }, manager: true });
  },
  logout: async () => {
    await call('/api/auth/logout', { body: {}, manager: true }).catch(() => {});
    await session.set(null);
  },
};

export const managerApi = {
  list: async () => (await call<{ deals: WireDeal[] }>('/api/deals', { manager: true })).deals.map(hydrate),
  get: async (id: string) => {
    const r = await call<{ deal: WireDeal; events: { at: string; type: string; data: unknown }[]; inviteUrl: string | null }>(
      `/api/deals/${id}`, { manager: true });
    return { deal: hydrate(r.deal), events: r.events.map((e) => ({ ...e, at: new Date(e.at) })), inviteUrl: r.inviteUrl };
  },
  /** Passport and selfie photos from verification, as data URLs. */
  kyc: async (id: string) =>
    (await call<{ images: Partial<Record<'passport' | 'selfie', { url: string; at: string }>> }>(`/api/deals/${id}/kyc`, { manager: true })).images,
  resendInvite: async (id: string) => { await call(`/api/deals/${id}/invite`, { body: {}, manager: true }); },
  recordPayment: async (id: string, p: { what: PayWhat; method: PaidBy; note: string }) =>
    hydrate((await call<{ deal: WireDeal }>(`/api/deals/${id}/payments`, { body: p, manager: true })).deal),
  cancel: async (id: string, reason: string) =>
    hydrate((await call<{ deal: WireDeal }>(`/api/deals/${id}/cancel`, { body: { reason }, manager: true })).deal),
  team: async () => (await call<{ managers: Manager[] }>('/api/managers', { manager: true })).managers,
  addColleague: async (m: { email: string; name: string; password: string; admin: boolean }) =>
    (await call<{ manager: Manager }>('/api/managers', { body: m, manager: true })).manager,
  resetPassword: async (id: number, password: string) =>
    (await call<{ manager: Manager }>(`/api/managers/${id}/password`, { body: { password }, manager: true })).manager,
  setDisabled: async (id: number, disabled: boolean) =>
    (await call<{ manager: Manager }>(`/api/managers/${id}/disabled`, { body: { disabled }, manager: true })).manager,
  create: async (d: Pick<Deal, 'clientName' | 'phone' | 'subject' | 'total' | 'downPct' | 'term'>) =>
    hydrate((await call<{ deal: WireDeal }>('/api/deals', { body: d, manager: true })).deal),
};

export type Payment = { id: string; status: 'pending' | 'paid' | 'failed'; url?: string };

export type EsignAgreement = { edition: number; title: string; text: string[] };
export const esignAgreement = () => call<EsignAgreement>('/api/esign-agreement');

/** Absolute server address; on the web build served by the server itself the API address is empty. */
const apiBase = () => API_URL || (typeof window !== 'undefined' ? window.location.origin : '');

export const companyApi = {
  get: () => call<{ company: Company; missing: string[] }>('/api/company', { manager: true }),
  save: (c: Company) => call<{ company: Company; missing: string[] }>('/api/company', { method: 'PUT', body: c, manager: true }),
};

export const backupsApi = {
  get: () => call<{ daily: { dir: string; keep: number; files: string[] } | null }>('/api/backups', { manager: true }),
};

/** A link to download a spreadsheet or, for an administrator, a copy of the database; it works once, within five minutes. */
export async function exportUrl(kind: 'deals.csv' | 'payments.csv' | 'backup.db') {
  const { key } = await call<{ key: string }>('/api/export/key', { body: {}, manager: true });
  return `${apiBase()}/api/export/${kind}?key=${encodeURIComponent(key)}`;
}

export const contractPdfUrl = (token: string) => `${API_URL}/api/client/${encodeURIComponent(token)}/contract.pdf`;

export const clientApi = {
  get: async (token: string) => hydrate((await call<{ deal: WireDeal }>(`/api/client/${token}`)).deal),
  /** Runs one step of the deal on the server and returns the updated deal. */
  step: async (token: string, step: string, body: object = {}) =>
    hydrate((await call<{ deal: WireDeal }>(`/api/client/${token}/${step}`, { body })).deal),
  /** Starts a payment: the test server confirms at once, a real acquirer returns a link to the bank page or SBP. */
  pay: async (token: string, what: PayWhat, method: PayMethod) => {
    const r = await call<{ deal: WireDeal; payment: Payment }>(`/api/client/${token}/pay`, { body: { what, method } });
    return { deal: hydrate(r.deal), payment: r.payment };
  },
  payment: async (token: string, id: string) => {
    const r = await call<{ deal: WireDeal; payment: Payment }>(`/api/client/${token}/payments/${encodeURIComponent(id)}`);
    return { deal: hydrate(r.deal), payment: r.payment };
  },
  kyc: async (token: string, images: { passportImage?: string; selfieImage?: string }) => {
    const r = await call<{ deal: WireDeal; passport: Passport; faceMatch: number }>(`/api/client/${token}/kyc`, { body: images });
    return { deal: hydrate(r.deal), passport: r.passport, faceMatch: r.faceMatch };
  },
};
