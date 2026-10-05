export type Passport = {
  fio: string;
  birth: string;
  series: string;
  issued: string;
  issuedAt: string;
  address: string;
};

export type Stage = 'invited' | 'phone' | 'documents' | 'contract' | 'sign' | 'pay' | 'active';
export type PayMethod = 'sbp' | 'card';

/** A deal as the API returns it. Dates are ISO strings. */
export type Deal = {
  id: string;
  no: string;
  token: string;
  seller: string;
  city: string;
  subject: string;
  total: number;
  downPct: number;
  term: number;
  clientName: string;
  phone: string;
  stage: Stage;
  createdAt: string;
  passport?: Passport;
  faceMatch?: number;
  signature?: { id: string; at: string };
  downPayment?: { at: string; method: PayMethod };
  /** Accepted edition of the simple electronic signature agreement. */
  esignAgreement?: { edition: number; at: string };
  installmentsPaid: { n: number; at: string }[];
};

export type DealEvent = { at: string; type: string; data: unknown };
