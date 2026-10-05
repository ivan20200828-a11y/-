export type Passport = {
  fio: string;
  birth: string;
  series: string;
  issued: string;
  issuedAt: string;
  address: string;
};

export type Stage = 'invited' | 'phone' | 'documents' | 'contract' | 'sign' | 'pay' | 'active' | 'cancelled';

export type PayMethod = 'sbp' | 'card';
/** How a payment arrived: through the acquirer, or outside the app and marked by a manager. */
export type PaidBy = PayMethod | 'transfer' | 'cash';
/** What is being paid: the down payment, the next installment, or everything left (early repayment). */
export type PayWhat = 'down' | 'next' | 'rest';
export const PAID_BY_LABEL: Record<PaidBy, string> = { sbp: 'СБП', card: 'карта', transfer: 'перевод', cash: 'наличные' };

/** The seller's company details printed in contracts. */
export type Company = {
  name: string; city: string; inn: string; kpp: string; ogrn: string; address: string; director: string;
  bank: string; bik: string; account: string; corrAccount: string; phone: string; email: string;
};

export type Deal = {
  id: string;
  no: string;
  token: string;
  seller: string;
  subject: string;
  city: string;
  total: number;
  downPct: number;
  term: number;
  clientName: string;
  phone: string;
  stage: Stage;
  createdAt: Date;
  passport?: Passport;
  faceMatch?: number;
  signature?: { id: string; at: Date };
  downPayment?: { at: Date; method: PaidBy };
  esignAgreement?: { edition: number; at: Date };
  installmentsPaid: { n: number; at: Date; method: PaidBy }[];
  sellerDetails?: Company;
};

export const downAmount = (d: Pick<Deal, 'total' | 'downPct'>) => Math.round((d.total * d.downPct) / 100);
