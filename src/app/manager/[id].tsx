import { useLocalSearchParams } from 'expo-router';

import { formatDate, rub } from '@/lib/money';
import { dealProgress } from '@/lib/schedule';
import { STAGE_LABEL, useDeals } from '@/state/deals';
import { downAmount } from '@/state/types';
import { ContractText, ScheduleTable } from '@/ui/contract';
import { Card, H1, H2, Hint, KV, Label, Pill, Progress, Screen } from '@/ui/kit';

export default function DealDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deal = useDeals().deals.find((d) => d.id === id);
  if (!deal) return <Screen><Card><H2>Сделка не найдена</H2></Card></Screen>;
  const { sum } = dealProgress(deal);
  return (
    <Screen>
      <Card>
        <Label>№ {deal.no} · создана {formatDate(deal.createdAt)}</Label>
        <H1>{deal.clientName}</H1>
        <Pill kind={deal.stage === 'active' ? 'ok' : 'wait'}>{STAGE_LABEL[deal.stage]}</Pill>
        <KV rows={[
          ['Предмет', deal.subject],
          ['Телефон', deal.phone],
          ['Стоимость', rub(deal.total)],
          ['Взнос', `${rub(downAmount(deal))} (${deal.downPct}%)`],
          ['Срок', `${deal.term} мес.`],
          ['Проверка личности', deal.faceMatch ? `пройдена, совпадение ${deal.faceMatch}%` : 'не пройдена'],
          ['Подпись', deal.signature ? `${formatDate(deal.signature.at)}, ${deal.signature.id}` : 'нет'],
          ['Оплачено', `${rub(sum)} из ${rub(deal.total)}`],
        ]} />
        <Progress value={sum / deal.total} />
      </Card>
      <Card>
        <H2>График платежей</H2>
        <ScheduleTable deal={deal} withStatus />
      </Card>
      <Card>
        <H2>Договор</H2>
        {!deal.passport && <Hint>Паспортные данные появятся после верификации клиента.</Hint>}
        <ContractText deal={deal} />
      </Card>
    </Screen>
  );
}
