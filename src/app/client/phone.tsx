import { router } from 'expo-router';
import { useState } from 'react';

import { withClientDeal } from '@/state/client-gate';
import { useClient } from '@/state/deals';
import { Button, Card, CodeField, ErrorText, Field, H2, Screen, Stepper } from '@/ui/kit';
import { ContactManager } from '@/ui/contact';

export default withClientDeal(function Phone({ deal }) {
  const { step } = useClient();
  const [phone, setPhone] = useState(deal.phone);
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
      <Stepper current="phone" />
      <Card>
        <H2>Подтвердите номер телефона</H2>
        <Field label="Телефон" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" editable={!sent} />
        {sent ? (
          <>
            <CodeField label="Код из SMS" value={code} onChangeText={(t) => { setCode(t); setError(''); }} />
            <Button title="Подтвердить" loading={busy} disabled={code.length < 4}
              onPress={() => run('phone/verify', { code }, () => router.push('/client/documents'))} />
            <Button ghost title="Отправить код ещё раз" disabled={busy} onPress={() => run('phone/send', { phone }, () => setCode(''))} />
          </>
        ) : (
          <Button title="Получить код" loading={busy} disabled={phone.replace(/\D/g, '').length < 11}
            onPress={() => run('phone/send', { phone }, () => setSent(true))} />
        )}
        {!!error && <ErrorText>{error}</ErrorText>}
      </Card>
      <ContactManager deal={deal} />
    </Screen>
  );
});
