import { router } from 'expo-router';
import { useState } from 'react';

import { formatDate, rub } from '@/lib/money';
import { payments } from '@/services';
import { useClientDeal, useDeals } from '@/state/deals';
import { downAmount, type PayMethod } from '@/state/types';
import { Big, Button, Card, Field, H2, Hint, Row, Screen, Stamp, Stepper, Tabs } from '@/ui/kit';

export default function Pay() {
  const deal = useClientDeal();
  const { update } = useDeals();
  const [method, setMethod] = useState<PayMethod>('sbp');
  const [busy, setBusy] = useState(false);
  const amount = downAmount(deal);

  const pay = async () => {
    setBusy(true);
    const res = await payments.pay(amount, method);
    setBusy(false);
    update(deal.id, { downPayment: { at: res.at, method }, stage: 'active' });
    router.replace('/client/cabinet');
  };

  return (
    <Screen>
      <Stepper current="pay" />
      <Card>
        {deal.signature && <Stamp>Подписано ПЭП {formatDate(deal.signature.at)} · {deal.signature.id}</Stamp>}
        <H2>Оплата первоначального взноса</H2>
        <Big>{rub(amount)}</Big>
        <Tabs items={[['sbp', 'СБП'], ['card', 'Картой']]} value={method} onChange={setMethod} />
        {method === 'sbp' ? (
          <Hint>Откроется приложение вашего банка, там нужно подтвердить перевод.</Hint>
        ) : (
          <Row>
            <Field label="Номер карты" defaultValue="2200 0000 0000 0004" keyboardType="number-pad" style={{ minWidth: 220 }} />
            <Field label="Срок" defaultValue="12/29" />
            <Field label="CVC" defaultValue="123" keyboardType="number-pad" secureTextEntry />
          </Row>
        )}
        <Button title={`Оплатить ${rub(amount)}`} onPress={pay} loading={busy} />
      </Card>
    </Screen>
  );
}
