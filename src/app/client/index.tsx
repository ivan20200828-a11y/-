import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { rub } from '@/lib/money';
import { useClient } from '@/state/deals';
import { downAmount } from '@/state/types';
import { Button, Card, ErrorText, H1, Hint, KV, Label, Loading, Screen } from '@/ui/kit';
import type { Deal } from '@/state/types';
import { ContactManager } from '@/ui/contact';

export default function Invite() {
  const { t } = useLocalSearchParams<{ t?: string }>();
  const { deal, error, load, setToken, token, step } = useClient();
  const [busy, setBusy] = useState(false);
  const [stepError, setStepError] = useState('');

  useEffect(() => {
    if (t) setToken(t);
  }, [t, setToken]);
  useEffect(() => {
    if (!t || t === token) load();
  }, [t, token, load]);

  if (!deal || (t && t !== deal.token)) return <Screen><Loading error={error} onRetry={load} /></Screen>;
  if (deal.stage === 'cancelled') return <Cancelled deal={deal} />;
  if (deal.stage === 'active') return <Redirect href="/client/cabinet" />;
  if (deal.stage !== 'invited') return <Redirect href={`/client/${deal.stage}`} />;

  const start = async () => {
    setBusy(true);
    const err = await step('start');
    setBusy(false);
    if (err) return setStepError(err);
    router.push('/client/phone');
  };

  const down = downAmount(deal);
  return (
    <Screen>
      <Card>
        <Label>{deal.seller} приглашает вас оформить сделку</Label>
        <H1>{deal.subject}</H1>
        <KV rows={[
          ['Сделка', `№ ${deal.no}`],
          ['Стоимость', rub(deal.total)],
          ['Первоначальный взнос', `${rub(down)} (${deal.downPct}%)`],
          ['Рассрочка', `${deal.term} мес. × ${rub((deal.total - down) / deal.term)}`],
        ]} />
        <Hint>Всё оформление проходит в приложении: проверка личности, договор, подпись и оплата взноса. В офис приходить не нужно.</Hint>
        <Button title="Начать оформление" onPress={start} loading={busy} />
        {!!stepError && <ErrorText>{stepError}</ErrorText>}
      </Card>
      <ContactManager deal={deal} />
    </Screen>
  );
}

function Cancelled({ deal }: { deal: Deal }) {
  return (
    <Screen>
      <Card>
        <Label>Сделка № {deal.no}</Label>
        <H1>Сделка отменена</H1>
        <Hint>{deal.seller} отменил эту сделку. Если это ошибка, свяжитесь с вашим менеджером.</Hint>
      </Card>
      <ContactManager deal={deal} />
    </Screen>
  );
}
