import type { Deal, Passport, PayMethod } from '@/state/types';

/** Server address. Set EXPO_PUBLIC_API_URL when the server runs elsewhere (a phone cannot reach "localhost" on your computer). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
/** Temporary: managers share one key until manager accounts with login exist. */
const MANAGER_KEY = process.env.EXPO_PUBLIC_MANAGER_KEY ?? 'demo-manager';

/** The server runs SMS, payments and identity checks in test mode; the code is always 1234. */
export const TEST_MODE = true;

type WireDeal = Omit<Deal, 'createdAt' | 'signature' | 'downPayment' | 'installmentsPaid'> & {
  createdAt: string;
  signature?: { id: string; at: string };
  downPayment?: { at: string; method: PayMethod };
  installmentsPaid: { n: number; at: string }[];
};

export type DealEvent = { at: Date; type: string; data: unknown };

export class ApiError extends Error {}

function hydrate(d: WireDeal): Deal {
  return {
    ...d,
    createdAt: new Date(d.createdAt),
    signature: d.signature && { ...d.signature, at: new Date(d.signature.at) },
    downPayment: d.downPayment && { ...d.downPayment, at: new Date(d.downPayment.at) },
    installmentsPaid: d.installmentsPaid.map((p) => ({ ...p, at: new Date(p.at) })),
  };
}

async function call<T>(path: string, init: { method?: string; body?: unknown; manager?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(init.manager ? { Authorization: `Bearer ${MANAGER_KEY}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'Не получилось выполнить действие. Попробуйте ещё раз.');
  return data as T;
}

export const managerApi = {
  list: async () => (await call<{ deals: WireDeal[] }>('/api/deals', { manager: true })).deals.map(hydrate),
  get: async (id: string) => {
    const r = await call<{ deal: WireDeal; events: { at: string; type: string; data: unknown }[] }>(`/api/deals/${id}`, { manager: true });
    return { deal: hydrate(r.deal), events: r.events.map((e) => ({ ...e, at: new Date(e.at) })) };
  },
  create: async (d: Pick<Deal, 'clientName' | 'phone' | 'subject' | 'total' | 'downPct' | 'term'>) =>
    hydrate((await call<{ deal: WireDeal }>('/api/deals', { body: d, manager: true })).deal),
};

export const clientApi = {
  get: async (token: string) => hydrate((await call<{ deal: WireDeal }>(`/api/client/${token}`)).deal),
  /** Runs one step of the deal on the server and returns the updated deal. */
  step: async (token: string, step: string, body: object = {}) =>
    hydrate((await call<{ deal: WireDeal }>(`/api/client/${token}/${step}`, { body })).deal),
  kyc: async (token: string, images: { passportImage?: string; selfieImage?: string }) => {
    const r = await call<{ deal: WireDeal; passport: Passport; faceMatch: number }>(`/api/client/${token}/kyc`, { body: images });
    return { deal: hydrate(r.deal), passport: r.passport, faceMatch: r.faceMatch };
  },
};
