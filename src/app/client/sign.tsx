import { router } from 'expo-router';
import { useState } from 'react';

import { withClientDeal } from '@/state/client-gate';
import { useClient } from '@/state/deals';
import { Button, Card, CodeField, ErrorText, H2, Hint, Screen, Stepper } from '@/ui/kit';

export default withClientDeal(function Sign({ deal }) {
  const { step } = useClient();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (name: string, body: object, then: () => void) => {
    setBusy(true);
    const err = await step(name, body);
    setBusy(false);
    if (err) return setError(err);
    setError('');
    then();
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
            <Button title="Подписать договор" loading={busy} disabled={code.length < 4}
              onPress={() => run('sign/verify', { code }, () => router.push('/client/pay'))} />
          </>
        ) : (
          <Button title="Получить код подписи" loading={busy} onPress={() => run('sign/send', {}, () => setSent(true))} />
        )}
        {!!error && <ErrorText>{error}</ErrorText>}
      </Card>
    </Screen>
  );
});
