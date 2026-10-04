import { router } from 'expo-router';
import { useState } from 'react';

import { esign, sms } from '@/services';
import { useClientDeal, useDeals } from '@/state/deals';
import { Button, Card, CodeField, ErrorText, H2, Hint, Screen, Stepper } from '@/ui/kit';

export default function Sign() {
  const deal = useClientDeal();
  const { update } = useDeals();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setBusy(true);
    await sms.sendCode(deal.phone);
    setSent(true);
    setBusy(false);
  };
  const sign = async () => {
    setBusy(true);
    const signature = await esign.sign(deal.id, code);
    setBusy(false);
    if (!signature) return setError('Код не подходит. Проверьте SMS и введите код ещё раз.');
    update(deal.id, { signature, stage: 'pay' });
    router.push('/client/pay');
  };

  return (
    <Screen>
      <Stepper current="sign" />
      <Card>
        <H2>Подписание договора</H2>
        <Hint>Договор подписывается простой электронной подписью: кодом из SMS на номер {deal.phone}.</Hint>
        {sent ? (
          <>
            <CodeField label="Код подписи" value={code} onChangeText={(t) => { setCode(t); setError(''); }} />
            <Button title="Подписать договор" onPress={sign} loading={busy} disabled={code.length < 4} />
          </>
        ) : (
          <Button title="Получить код подписи" onPress={send} loading={busy} />
        )}
        {!!error && <ErrorText>{error}</ErrorText>}
      </Card>
    </Screen>
  );
}
