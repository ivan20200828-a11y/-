const rubFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export const rub = (n: number) => `${rubFormat.format(Math.round(n))} ₽`;

export const formatDate = (d: Date) =>
  d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Adds months keeping the day of the month, or the last day when the month is shorter (31 Jan + 1 = 28/29 Feb). */
export const addMonths = (d: Date, m: number) => {
  const x = new Date(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + m);
  x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  return x;
};

export const parseAmount = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;
