import { router } from 'expo-router';
import { useState } from 'react';

import { sms } from '@/services';
import { useClientDeal, useDeals } from '@/state/deals';
import { Button, Card, CodeField, ErrorText, Field, H2, Screen, Stepper } from '@/ui/kit';

export default function Phone() {
  const deal = useClientDeal();
  const { update } = useDeals();
  const [phone, setPhone] = useState(deal.phone);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setBusy(true);
    setRequestId((await sms.sendCode(phone)).requestId);
    setBusy(false);
  };
  const check = async () => {
    setBusy(true);
    const ok = await sms.verify(requestId!, code);
    setBusy(false);
    if (!ok) return setError('Код не подходит. Проверьте SMS и введите код ещё раз.');
    update(deal.id, { phone, stage: 'documents' });
    router.push('/client/documents');
  };

  return (
    <Screen>
      <Stepper current="phone" />
      <Card>
        <H2>Подтвердите номер телефона</H2>
        <Field label="Телефон" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
        {requestId ? (
          <>
            <CodeField label="Код из SMS" value={code} onChangeText={(t) => { setCode(t); setError(''); }} />
            <Button title="Подтвердить" onPress={check} loading={busy} disabled={code.length < 4} />
          </>
        ) : (
          <Button title="Получить код" onPress={send} loading={busy} disabled={phone.replace(/\D/g, '').length < 11} />
        )}
        {!!error && <ErrorText>{error}</ErrorText>}
      </Card>
    </Screen>
  );
}
