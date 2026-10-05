import { router } from 'expo-router';
import { useState } from 'react';

import { formatDate, rub } from '@/lib/money';
import { withClientDeal } from '@/state/client-gate';
import { usePayment } from '@/state/payment';
import { downAmount, type PayMethod } from '@/state/types';
import { Big, Button, Card, ErrorText, H2, Hint, Screen, Stamp, Stepper, Tabs } from '@/ui/kit';
import { PaymentWaiting, TransferDetails } from '@/ui/payment';

export default withClientDeal(function Pay({ deal }) {
  const [method, setMethod] = useState<PayMethod | 'transfer'>('sbp');
  const payment = usePayment(() => router.replace('/client/cabinet'));
  const amount = downAmount(deal);

  return (
    <Screen>
      <Stepper current="pay" />
      <Card>
        {deal.signature && <Stamp>Подписано ПЭП {formatDate(deal.signature.at)} · {deal.signature.id}</Stamp>}
        <H2>Оплата первоначального взноса</H2>
        <Big>{rub(amount)}</Big>
        {payment.waiting ? (
          <PaymentWaiting onReopen={payment.reopen} onCancel={payment.cancel} />
        ) : (
          <>
            <Tabs items={[['sbp', 'СБП'], ['card', 'Картой'], ['transfer', 'Переводом']]} value={method} onChange={setMethod} />
            {method === 'transfer' ? (
              <TransferDetails deal={deal} amount={amount} purpose="первоначальный взнос" />
            ) : (
              <>
                <Hint>
                  {method === 'sbp'
                    ? 'Откроется приложение вашего банка, там нужно подтвердить перевод. На компьютере появится QR-код для камеры телефона.'
                    : 'Откроется защищённая страница банка для ввода данных карты. Мы не видим и не храним номер карты.'}
                </Hint>
                <Button title={`Оплатить ${rub(amount)}`} onPress={() => payment.start('down', method)} loading={payment.busy} />
              </>
            )}
          </>
        )}
        {!!payment.error && <ErrorText>{payment.error}</ErrorText>}
      </Card>
    </Screen>
  );
});
