const rubFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export const rub = (n: number) => `${rubFormat.format(Math.round(n))} ₽`;

export const formatDate = (d: Date) =>
  d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const addMonths = (d: Date, m: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + m);
  return x;
};

export const parseAmount = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;
