import type { Company } from '@/state/types';

/** "ООО «Альфа» (ИНН …, ОГРН …), в лице генерального директора …" — the seller in the contract preamble. */
export function sellerIntro(c: Company) {
  const ids = [c.inn && `ИНН ${c.inn}`, c.ogrn && `ОГРН ${c.ogrn}`].filter(Boolean).join(', ');
  return `${c.name}${ids ? ` (${ids})` : ''}${c.director ? `, в лице ${c.director}` : ''}`;
}

/** The seller's block in the "Реквизиты сторон" section. */
export function sellerRequisites(c: Company): string[] {
  return [
    c.name,
    c.inn && `ИНН ${c.inn}${c.kpp ? `, КПП ${c.kpp}` : ''}`,
    c.ogrn && `ОГРН ${c.ogrn}`,
    c.address && `Адрес: ${c.address}`,
    c.account && `Р/с ${c.account}${c.bank ? ` в ${c.bank}` : ''}`,
    c.bik && `БИК ${c.bik}${c.corrAccount ? `, к/с ${c.corrAccount}` : ''}`,
    [c.phone, c.email].filter(Boolean).join(', '),
  ].filter(Boolean) as string[];
}
