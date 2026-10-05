import { useCallback, useEffect, useState } from 'react';

import { companyApi } from '@/api';
import type { Company } from '@/state/types';
import { Button, Card, ErrorText, Field, H2, Hint, Loading, Row, Screen } from '@/ui/kit';

type Key = keyof Company;
const digits = { keyboardType: 'number-pad' as const };

/** The admin's form for the company details printed in every new contract. */
export default function CompanyScreen() {
  const [form, setForm] = useState<Company | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    companyApi.get().then((r) => { setForm(r.company); setMissing(r.missing); }, (e) => setLoadError((e as Error).message));
  }, []);
  useEffect(load, [load]);

  if (!form) return <Screen><Loading error={loadError} onRetry={load} /></Screen>;

  const field = (key: Key, label: string, extra: object = {}) => (
    <Field label={label} value={form[key]} onChangeText={(v) => { setForm({ ...form, [key]: v }); setSaved(false); }} {...extra} />
  );

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await companyApi.save(form);
      setForm(r.company);
      setMissing(r.missing);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <H2>Реквизиты компании</H2>
        <Hint>Попадают в каждый новый договор. В уже созданных сделках остаются реквизиты на момент создания.</Hint>
        {missing.length > 0 && <ErrorText>Не заполнено: {missing.join(', ')}.</ErrorText>}
        {field('name', 'Название', { placeholder: 'ООО «Альфа-Сделка»' })}
        {field('director', 'Кто подписывает', { placeholder: 'генерального директора Иванова Ивана Ивановича, действующего на основании Устава' })}
        <Row>
          {field('inn', 'ИНН', digits)}
          {field('kpp', 'КПП', digits)}
          {field('ogrn', 'ОГРН', digits)}
        </Row>
        {field('address', 'Юридический адрес')}
        {field('city', 'Город заключения договоров')}
      </Card>
      <Card>
        <H2>Банк</H2>
        {field('bank', 'Банк', { placeholder: 'АО «Банк»' })}
        <Row>
          {field('bik', 'БИК', digits)}
          {field('corrAccount', 'Корр. счёт', digits)}
        </Row>
        {field('account', 'Расчётный счёт', digits)}
      </Card>
      <Card>
        <H2>Контакты для клиентов</H2>
        <Row>
          {field('phone', 'Телефон', { keyboardType: 'phone-pad' })}
          {field('email', 'Почта', { keyboardType: 'email-address', autoCapitalize: 'none' })}
        </Row>
        <Button title="Сохранить" onPress={save} loading={busy} />
        {!!error && <ErrorText>{error}</ErrorText>}
        {saved && <Hint>Сохранено. Новые договоры будут с этими реквизитами.</Hint>}
      </Card>
    </Screen>
  );
}
