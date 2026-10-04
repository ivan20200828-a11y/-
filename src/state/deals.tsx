import { createContext, useContext, useState, type ReactNode } from 'react';

import type { Deal, Stage } from './types';

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

const SEED: Deal[] = [
  {
    id: 'd147', no: 'Д-2026-0147', seller: 'ООО «Альфа-Сделка»', city: 'Москва',
    subject: 'Автомобиль Haval Jolion, 2025 г.', total: 2490000, downPct: 20, term: 24,
    clientName: 'Смирнов Алексей Петрович', phone: '+7 916 555-18-40', stage: 'invited',
    createdAt: daysAgo(0), installmentsPaid: [],
  },
  {
    id: 'd139', no: 'Д-2026-0139', seller: 'ООО «Альфа-Сделка»', city: 'Москва',
    subject: 'Квартира-студия, ЖК «Река»', total: 6800000, downPct: 30, term: 36,
    clientName: 'Ковалёва Мария Игоревна', phone: '+7 925 301-44-12', stage: 'active',
    createdAt: daysAgo(70), signature: { id: 'ПЭП-D139-SAMPLE', at: daysAgo(68) },
    downPayment: { at: daysAgo(67), method: 'sbp' },
    installmentsPaid: [{ n: 1, at: daysAgo(37) }, { n: 2, at: daysAgo(7) }],
  },
  {
    id: 'd142', no: 'Д-2026-0142', seller: 'ООО «Альфа-Сделка»', city: 'Москва',
    subject: 'Kia Sportage 2024', total: 3150000, downPct: 15, term: 18,
    clientName: 'Ибрагимов Руслан Тимурович', phone: '+7 903 718-02-55', stage: 'sign',
    createdAt: daysAgo(3), installmentsPaid: [],
  },
  {
    id: 'd145', no: 'Д-2026-0145', seller: 'ООО «Альфа-Сделка»', city: 'Москва',
    subject: 'Кухонный гарнитур под заказ', total: 420000, downPct: 30, term: 6,
    clientName: 'Орлова Анна Сергеевна', phone: '+7 977 640-90-31', stage: 'documents',
    createdAt: daysAgo(1), installmentsPaid: [],
  },
];

type NewDeal = Pick<Deal, 'clientName' | 'phone' | 'subject' | 'total' | 'downPct' | 'term'>;

type Store = {
  deals: Deal[];
  /** The deal the client side of the app is working on (in production: from the invite link). */
  clientDealId: string;
  get: (id: string) => Deal;
  update: (id: string, patch: Partial<Deal>) => void;
  advance: (id: string, stage: Stage) => void;
  create: (d: NewDeal) => Deal;
  resetClientDeal: () => void;
};

const Ctx = createContext<Store | null>(null);

export function DealsProvider({ children }: { children: ReactNode }) {
  const [deals, setDeals] = useState<Deal[]>(SEED);
  const clientDealId = 'd147';

  const update = (id: string, patch: Partial<Deal>) =>
    setDeals((all) => all.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const store: Store = {
    deals,
    clientDealId,
    get: (id) => deals.find((d) => d.id === id)!,
    update,
    advance: (id, stage) => update(id, { stage }),
    create: (n) => {
      const seq = 148 + deals.length - SEED.length;
      const deal: Deal = {
        ...n, id: `d${seq}`, no: `Д-2026-0${seq}`, seller: 'ООО «Альфа-Сделка»', city: 'Москва',
        stage: 'invited', createdAt: new Date(), installmentsPaid: [],
      };
      setDeals((all) => [deal, ...all]);
      return deal;
    },
    resetClientDeal: () => {
      const seed = SEED.find((d) => d.id === clientDealId)!;
      setDeals((all) => all.map((d) => (d.id === clientDealId ? { ...seed } : d)));
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useDeals() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useDeals must be used inside DealsProvider');
  return s;
}

export function useClientDeal() {
  const s = useDeals();
  return s.get(s.clientDealId);
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
