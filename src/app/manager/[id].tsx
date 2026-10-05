import { router, useLocalSearchParams } from 'expo-router';
import { Linking, View } from 'react-native';

import { contractPdfUrl } from '@/api';

import { formatDate, rub } from '@/lib/money';
import { dealProgress } from '@/lib/schedule';
import { STAGE_LABEL, useDealDetails } from '@/state/deals';
import { downAmount } from '@/state/types';
import { ContractText, ScheduleTable } from '@/ui/contract';
import { Button, Card, H1, H2, Hint, KV, Label, Loading, Pill, Progress, Screen, Txt } from '@/ui/kit';

const EVENT_LABEL: Record<string, string> = {
  created: 'Сделка создана, клиенту отправлено приглашение',
  started: 'Клиент открыл приглашение',
  phone_code_sent: 'Отправлен код подтверждения телефона',
  phone_verified: 'Телефон подтверждён',
  kyc_checked: 'Проверены паспорт и селфи',
  passport_confirmed: 'Клиент подтвердил паспортные данные',
  contract_accepted: 'Клиент ознакомился с договором',
  sign_code_sent: 'Отправлен код подписи',
  signed: 'Договор подписан',
  paid: 'Получен платёж',
  payment_started: 'Клиент начал оплату',
  payment_failed: 'Платёж не прошёл',
  payment_error: 'Банк не ответил на запрос оплаты',
  payment_duplicate: 'Лишний платёж, нужен возврат',
  payment_amount_mismatch: 'Сумма от банка не совпала',
};

const time = (d: Date) => `${formatDate(d)} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;

export default function DealDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { deal, events, error } = useDealDetails(id);
  if (!deal || !events) return <Screen><Loading error={error} /></Screen>;
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
          ['Проверка личности', deal.passport ? `пройдена, совпадение ${deal.faceMatch}%` : 'не пройдена'],
          ['Подпись', deal.signature ? `${formatDate(deal.signature.at)}, ${deal.signature.id}` : 'нет'],
          ['Оплачено', `${rub(sum)} из ${rub(deal.total)}`],
        ]} />
        <Progress value={sum / deal.total} />
        <Hint>Код приглашения клиента: {deal.token}</Hint>
        <Button ghost title="Открыть сделку глазами клиента" onPress={() => router.push(`/client?t=${encodeURIComponent(deal.token)}`)} />
      </Card>
      <Card>
        <H2>История</H2>
        {events.map((e, i) => (
          <View key={i} style={{ gap: 2 }}>
            <Hint>{time(e.at)}</Hint>
            <Txt>{EVENT_LABEL[e.type] ?? e.type}
              {(e.type === 'paid' || e.type === 'payment_duplicate') && typeof e.data === 'object' && e.data && 'amount' in e.data ? `: ${rub(Number((e.data as { amount: number }).amount))}` : ''}</Txt>
          </View>
        ))}
      </Card>
      <Card>
        <H2>График платежей</H2>
        <ScheduleTable deal={deal} withStatus />
      </Card>
      <Card>
        <H2>Договор</H2>
        {!deal.passport && <Hint>Паспортные данные появятся после верификации клиента.</Hint>}
        <Button ghost title="Скачать договор в PDF" onPress={() => Linking.openURL(contractPdfUrl(deal.token))} />
        <ContractText deal={deal} />
      </Card>
    </Screen>
  );
}
