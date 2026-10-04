import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

import { clientApi, managerApi, type DealEvent } from '@/api';

import type { Deal, Stage } from './types';

// ---------- client: one deal, opened by the token from the invite link ----------

type ClientStore = {
  token: string;
  setToken: (t: string) => void;
  deal: Deal | null;
  error: string;
  load: () => Promise<void>;
  /** Runs a server step; on failure returns the error text instead of throwing. */
  step: (step: string, body?: object) => Promise<string | null>;
  setDeal: (d: Deal) => void;
};

const ClientCtx = createContext<ClientStore | null>(null);

/** The demo deal; a real invite link opens /client?t=<token>. */
const DEMO_TOKEN = 'demo';

export function ClientProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState(DEMO_TOKEN);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setDeal(await clientApi.get(token));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);

  const store: ClientStore = {
    token,
    setToken: (t) => {
      if (t === token) return;
      setDeal(null);
      setTokenState(t);
    },
    deal,
    error,
    load,
    setDeal,
    step: async (step, body) => {
      try {
        setDeal(await clientApi.step(token, step, body));
        return null;
      } catch (e) {
        return (e as Error).message;
      }
    },
  };
  return <ClientCtx.Provider value={store}>{children}</ClientCtx.Provider>;
}

export function useClient() {
  const s = useContext(ClientCtx);
  if (!s) throw new Error('useClient must be used inside ClientProvider');
  return s;
}

/** The current client deal on screens that are only reachable once it has loaded. */
export function useClientDeal() {
  const { deal } = useClient();
  if (!deal) throw new Error('Client deal is not loaded');
  return deal;
}

// ---------- manager ----------

export function useDealList() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [error, setError] = useState('');
  useFocusEffect(
    useCallback(() => {
      managerApi.list().then((d) => { setDeals(d); setError(''); }, (e: Error) => setError(e.message));
    }, []),
  );
  return { deals, error };
}

export function useDealDetails(id: string) {
  const [data, setData] = useState<{ deal: Deal; events: DealEvent[] } | null>(null);
  const [error, setError] = useState('');
  useFocusEffect(
    useCallback(() => {
      managerApi.get(id).then((d) => { setData(d); setError(''); }, (e: Error) => setError(e.message));
    }, [id]),
  );
  return { ...data, error };
}

export const STAGE_LABEL: Record<Stage, string> = {
  invited: 'Приглашение отправлено',
  phone: 'Подтверждает телефон',
  documents: 'Верификация',
  contract: 'Изучает договор',
  sign: 'Ждёт подписания',
  pay: 'Ждёт оплаты взноса',
  active: 'Платежи по графику',
};
