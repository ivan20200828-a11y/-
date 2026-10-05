import type { Manager } from './auth.ts';
import type { DB } from './db.ts';
import { ApiError } from './deals.ts';
import type { Company } from './types.ts';

const EMPTY: Company = {
  name: 'ООО «Альфа-Сделка»', city: 'Москва', inn: '', kpp: '', ogrn: '', address: '', director: '',
  bank: '', bik: '', account: '', corrAccount: '', phone: '', email: '',
};

/** The seller's details: printed in every new contract and in the SMS. A deal keeps the details it was created with. */
export class CompanyService {
  db: DB;
  constructor(db: DB) {
    this.db = db;
    db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }

  get(): Company {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = 'company'`).get() as { value: string } | undefined;
    return { ...EMPTY, ...(row ? JSON.parse(row.value) : {}) };
  }

  /** Requisites still missing for a proper contract. */
  missing(c = this.get()) {
    const required: [keyof Company, string][] = [['inn', 'ИНН'], ['ogrn', 'ОГРН'], ['address', 'адрес'], ['director', 'подписант'],
      ['bank', 'банк'], ['bik', 'БИК'], ['account', 'расчётный счёт']];
    return required.filter(([k]) => !c[k].trim()).map(([, label]) => label);
  }

  update(by: Manager | null, patch: Partial<Company>): Company {
    if (by && !by.admin) throw new ApiError(403, 'Реквизиты компании меняет только администратор');
    const next = { ...this.get() };
    for (const k of Object.keys(EMPTY) as (keyof Company)[]) {
      if (patch[k] !== undefined) next[k] = String(patch[k]).trim();
    }
    if (!next.name) throw new ApiError(400, 'Укажите название компании');
    if (!next.city) throw new ApiError(400, 'Укажите город, в котором заключаются договоры');
    const digits = (k: keyof Company, len: number[], label: string) => {
      if (next[k] && (!/^\d+$/.test(next[k]) || !len.includes(next[k].length))) {
        throw new ApiError(400, `${label}: должно быть ${len.join(' или ')} цифр`);
      }
    };
    digits('inn', [10, 12], 'ИНН');
    digits('kpp', [9], 'КПП');
    digits('ogrn', [13, 15], 'ОГРН');
    digits('bik', [9], 'БИК');
    digits('account', [20], 'Расчётный счёт');
    digits('corrAccount', [20], 'Корр. счёт');
    this.db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('company', ?)`).run(JSON.stringify(next));
    return next;
  }
}

/** "ООО «Альфа», ИНН 7701234567, ОГРН 1027700000000, в лице генерального директора Иванова И. И., действующего на основании Устава" */
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
