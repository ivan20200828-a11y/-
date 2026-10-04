import { session } from '@/lib/session';
import type { Deal, Passport, PayMethod } from '@/state/types';

/** Server address. Set EXPO_PUBLIC_API_URL when the server runs elsewhere (a phone cannot reach "localhost" on your computer). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/** The server runs SMS, payments and identity checks in test mode; the code is always 1234. */
export const TEST_MODE = true;

type WireDeal = Omit<Deal, 'createdAt' | 'signature' | 'downPayment' | 'installmentsPaid'> & {
  createdAt: string;
  signature?: { id: string; at: string };
  downPayment?: { at: string; method: PayMethod };
  installmentsPaid: { n: number; at: string }[];
};

export type DealEvent = { at: Date; type: string; data: unknown };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

export type Manager = { id: number; email: string; name: string };

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
  logout: async () => {
    await call('/api/auth/logout', { body: {}, manager: true }).catch(() => {});
    await session.set(null);
  },
};

export const managerApi = {
  list: async () => (await call<{ deals: WireDeal[] }>('/api/deals', { manager: true })).deals.map(hydrate),
  get: async (id: string) => {
    const r = await call<{ deal: WireDeal; events: { at: string; type: string; data: unknown }[] }>(`/api/deals/${id}`, { manager: true });
    return { deal: hydrate(r.deal), events: r.events.map((e) => ({ ...e, at: new Date(e.at) })) };
  },
  create: async (d: Pick<Deal, 'clientName' | 'phone' | 'subject' | 'total' | 'downPct' | 'term'>) =>
    hydrate((await call<{ deal: WireDeal }>('/api/deals', { body: d, manager: true })).deal),
};

export const contractPdfUrl = (token: string) => `${API_URL}/api/client/${encodeURIComponent(token)}/contract.pdf`;

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
