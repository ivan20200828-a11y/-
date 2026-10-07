import { addMonths, startOfDay, startOfMonth } from './money';

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

const DAY = 86400000;

/** How much of a deal is paid, the next payment, and the installments past their date and still unpaid. */
export function dealProgress(deal: DealLike, now = new Date()) {
  const down = Math.round((deal.total * deal.downPct) / 100);
  const rows = buildSchedule(deal.total, down, deal.term, deal.signature?.at ?? new Date());
  const paid = new Set(deal.installmentsPaid.map((p) => p.n));
  const sum = (deal.downPayment ? down : 0) + rows.filter((r) => paid.has(r.n)).reduce((a, r) => a + r.amount, 0);
  const today = startOfDay(now);
  const late = deal.downPayment ? rows.filter((r) => !paid.has(r.n) && startOfDay(r.date) < today) : [];
  const overdue = late.length
    ? { count: late.length, amount: late.reduce((a, r) => a + r.amount, 0), days: Math.round((+today - +startOfDay(late[0].date)) / DAY) }
    : null;
  return { rows, sum, next: rows.find((r) => !paid.has(r.n)), paid, overdue, isLate: (n: number) => late.some((r) => r.n === n) };
}

/** Russian word form for a count: plural(5, 'платёж', 'платежа', 'платежей') → "5 платежей". */
export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return `${n} ${w}`;
};

/** "3 дня", "21 день", "5 дней" */
export const days = (n: number) => plural(n, 'день', 'дня', 'дней');

/** Money across all deals for the manager's summary: collected, overdue and expected soon. */
export function portfolio(deals: (DealLike & { stage: string; downPayment?: { at: Date }; installmentsPaid: { n: number; at: Date }[] })[], now = new Date()) {
  const monthStart = startOfMonth(now);
  const soon = new Date(+startOfDay(now) + 30 * DAY);
  const r = { onboarding: 0, active: 0, collected: 0, month: 0, overdue: 0, overdueDeals: 0, expected: 0 };
  for (const d of deals) {
    if (d.stage === 'cancelled') continue;
    if (d.stage === 'active') r.active++; else r.onboarding++;
    const p = dealProgress(d, now);
    r.collected += p.sum;
    const down = Math.round((d.total * d.downPct) / 100);
    if (d.downPayment && d.downPayment.at >= monthStart) r.month += down;
    for (const paid of d.installmentsPaid) {
      if (paid.at >= monthStart) r.month += p.rows.find((x) => x.n === paid.n)?.amount ?? 0;
    }
    if (p.overdue) { r.overdue += p.overdue.amount; r.overdueDeals++; }
    if (d.downPayment) {
      r.expected += p.rows.filter((x) => !p.paid.has(x.n) && startOfDay(x.date) >= startOfDay(now) && x.date < soon).reduce((a, x) => a + x.amount, 0);
    }
  }
  return r;
}
