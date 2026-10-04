import { addMonths } from './money';

export type Installment = { n: number; date: Date; amount: number };

/** Interest-free installments: the remainder after the down payment is split evenly, the last payment absorbs rounding. */
export function buildSchedule(total: number, down: number, term: number, start: Date): Installment[] {
  const rest = total - down;
  const base = Math.floor(rest / term);
  return Array.from({ length: term }, (_, i) => ({
    n: i + 1,
    date: addMonths(start, i + 1),
    amount: i < term - 1 ? base : rest - base * (term - 1),
  }));
}

type DealLike = {
  total: number; downPct: number; term: number;
  signature?: { at: Date }; downPayment?: unknown; installmentsPaid: { n: number }[];
};

/** How much of a deal is paid: the down payment (if made) plus every paid installment. */
export function dealProgress(deal: DealLike) {
  const down = Math.round((deal.total * deal.downPct) / 100);
  const rows = buildSchedule(deal.total, down, deal.term, deal.signature?.at ?? new Date());
  const paid = new Set(deal.installmentsPaid.map((p) => p.n));
  const sum = (deal.downPayment ? down : 0) + rows.filter((r) => paid.has(r.n)).reduce((a, r) => a + r.amount, 0);
  return { rows, sum, next: rows.find((r) => !paid.has(r.n)) };
}
