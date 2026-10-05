/** Adds months keeping the day of the month, or the last day when the month is shorter (31 Jan + 1 = 28/29 Feb). */
export function addMonths(d: Date, m: number) {
  const x = new Date(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + m);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last));
  return x;
}
