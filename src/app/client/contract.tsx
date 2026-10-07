import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { esignAgreement, type EsignAgreement } from '@/api';
import { withClientDeal } from '@/state/client-gate';
import { useClient } from '@/state/deals';
import { ContractText } from '@/ui/contract';
import { Button, Card, Checkbox, ErrorText, H2, Hint, Screen, Stepper, Txt } from '@/ui/kit';
import { ContactManager } from '@/ui/contact';

export default withClientDeal(function Contract({ deal }) {
  const { step } = useClient();
  const [agreed, setAgreed] = useState(false);
  const [esignAgreed, setEsignAgreed] = useState(false);
  const [agreement, setAgreement] = useState<EsignAgreement | null>(null);
  const [showAgreement, setShowAgreement] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    esignAgreement().then(setAgreement, (e) => setError((e as Error).message));
  }, []);

  const next = async () => {
    if (!agreement) return;
    setBusy(true);
    // The terms shown, so the server can refuse if the manager changed them meanwhile.
    const terms = `${deal.subject}|${deal.total}|${deal.downPct}|${deal.term}`;
    const err = await step('contract/accept', { esignEdition: agreement.edition, terms });
    setBusy(false);
    if (err) return setError(err);
    router.push('/client/sign');
  };

  return (
    <Screen>
      <Stepper current="contract" />
      <Card>
        <H2>Договор</H2>
        <Hint>Договор составлен из ваших данных. Прочитайте его целиком.</Hint>
        <ContractText deal={deal} />
      </Card>
      <Card>
        <H2>Подпись кодом из SMS</H2>
        <Hint>Договор подписывается кодом, который придёт на ваш телефон. Для этого нужно принять соглашение о простой электронной подписи.</Hint>
        <Button ghost title={showAgreement ? 'Скрыть соглашение' : 'Прочитать соглашение'} onPress={() => setShowAgreement(!showAgreement)} />
        {showAgreement && agreement && (
          <View style={{ gap: 8 }}>
            <Txt style={{ fontWeight: '600' }}>{agreement.title}</Txt>
            {agreement.text.map((line) => <Hint key={line}>{line}</Hint>)}
          </View>
        )}
        <Checkbox checked={agreed} onChange={setAgreed}>Я прочитал договор и согласен с условиями и графиком платежей</Checkbox>
        <Checkbox checked={esignAgreed} onChange={setEsignAgreed}>Я принимаю соглашение об использовании простой электронной подписи</Checkbox>
        <Button title="Перейти к подписанию" disabled={!agreed || !esignAgreed || !agreement} loading={busy} onPress={next} />
        {!!error && <ErrorText>{error}</ErrorText>}
      </Card>
      <ContactManager deal={deal} />
    </Screen>
  );
});
