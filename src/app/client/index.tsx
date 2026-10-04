import { Redirect, router } from 'expo-router';

import { rub } from '@/lib/money';
import { useClientDeal, useDeals } from '@/state/deals';
import { downAmount } from '@/state/types';
import { Button, Card, H1, Hint, KV, Label, Screen } from '@/ui/kit';

export default function Invite() {
  const deal = useClientDeal();
  const { advance } = useDeals();
  if (deal.stage === 'active') return <Redirect href="/client/cabinet" />;
  if (deal.stage !== 'invited') return <Redirect href={`/client/${deal.stage}`} />;

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
        <Button title="Начать оформление" onPress={() => { advance(deal.id, 'phone'); router.push('/client/phone'); }} />
      </Card>
    </Screen>
  );
}
