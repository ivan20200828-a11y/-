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

/** The seller's company details printed in contracts. */
export type Company = {
  name: string; city: string; inn: string; kpp: string; ogrn: string; address: string;
  /** Who signs for the company, as it reads in a contract: "генерального директора Иванова Ивана Ивановича, действующего на основании Устава". */
  director: string;
  bank: string; bik: string; account: string; corrAccount: string; phone: string; email: string;
};

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
  /** The seller's details as they were when the deal was created. */
  sellerDetails?: Company;
};

export type DealEvent = { at: string; type: string; data: unknown };
