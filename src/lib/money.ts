const rubFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export const rub = (n: number) => `${rubFormat.format(Math.round(n))} ₽`;

/**
 * The contract, the server and SMS reminders count days in Moscow time, so the app does too, wherever the phone is.
 * Moscow has no daylight saving, so a fixed UTC+3 is exact and needs no time-zone data on the device.
 */
const MSK = 3 * 3600000;
const msk = (d: Date) => new Date(+d + MSK);
const pad = (n: number) => String(n).padStart(2, '0');

export const formatDate = (d: Date) => {
  const x = msk(d);
  return `${pad(x.getUTCDate())}.${pad(x.getUTCMonth() + 1)}.${x.getUTCFullYear()}`;
};

export const formatTime = (d: Date) => {
  const x = msk(d);
  return `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
};

/** Midnight of the Moscow calendar day. */
export const startOfDay = (d: Date) => {
  const x = msk(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) - MSK);
};

/** First moment of the Moscow calendar month. */
export const startOfMonth = (d: Date) => {
  const x = msk(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1) - MSK);
};

/** Adds months on the Moscow calendar keeping the day of the month, or the last day when the month is shorter (31 Jan + 1 = 28/29 Feb). */
export const addMonths = (d: Date, m: number) => {
  const x = msk(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + m);
  x.setUTCDate(Math.min(day, new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate()));
  return new Date(+x - MSK);
};

export const parseAmount = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;
