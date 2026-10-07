import { router, useLocalSearchParams } from 'expo-router';
import { Linking, View } from 'react-native';

import { contractPdfUrl, paymentsPdfUrl } from '@/api';

import { formatDate, formatTime, rub } from '@/lib/money';
import { days, dealProgress, plural } from '@/lib/schedule';
import { EDITABLE, STAGE_LABEL, useDealDetails } from '@/state/deals';
import { downAmount, PAID_BY_LABEL, type PaidBy } from '@/state/types';
import { ContractText, ScheduleTable } from '@/ui/contract';
import { CancelDeal, InviteCard, KycPhotos, RecordPayment } from '@/ui/manager-actions';
import { Button, Card, H1, H2, Hint, KV, Label, Loading, Pill, Progress, Screen, Txt } from '@/ui/kit';

const EVENT_LABEL: Record<string, string> = {
  edited: 'Условия сделки изменены',
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
  esign_agreement_accepted: 'Принято соглашение о простой электронной подписи',
  reminder_soon: 'Отправлено напоминание о платеже',
  reminder_overdue: 'Отправлено напоминание о просрочке',
  invite_resent: 'Приглашение отправлено повторно',
  cancelled: 'Сделка отменена',
  sms_failed: 'SMS не отправлено, проверьте баланс SMSC.ru',
};

const FIELD_LABEL: Record<string, string> = { clientName: 'ФИО', phone: 'телефон', subject: 'предмет', total: 'стоимость', downPct: 'взнос', term: 'срок' };
const fieldValue = (k: string, v: unknown) => (k === 'total' ? rub(Number(v)) : k === 'downPct' ? `${v}%` : k === 'term' ? `${v} мес.` : String(v));

/** ": стоимость 1 000 000 ₽ → 1 200 000 ₽" for a correction of the deal. */
function editText(data: unknown) {
  const changes = (data as { changes?: Record<string, { from: unknown; to: unknown }> } | null)?.changes;
  if (!changes) return '';
  return `: ${Object.entries(changes).map(([k, c]) => `${FIELD_LABEL[k] ?? k} ${fieldValue(k, c.from)} → ${fieldValue(k, c.to)}`).join('; ')}`;
}

/** "Досрочное погашение: 1 200 000 ₽, перевод · п/п № 42" for a payment event. */
function paymentText(type: string, data: unknown) {
  if (type === 'edited') return editText(data);
  if ((type !== 'paid' && type !== 'payment_duplicate') || !data || typeof data !== 'object' || !('amount' in data)) return '';
  const p = data as { amount: number; kind?: string; method?: PaidBy; note?: string };
  return `${type === 'paid' && p.kind === 'rest' ? ' (досрочное погашение)' : ''}: ${rub(Number(p.amount))}`
    + `${p.method ? `, ${PAID_BY_LABEL[p.method] ?? p.method}` : ''}${p.note ? ` · ${p.note}` : ''}`;
}

/** "· Анна" when a manager did it. */
const byWhom = (data: unknown) => (data && typeof data === 'object' && 'by' in data ? ` · ${String((data as { by: string }).by)}` : '');

const time = (d: Date) => `${formatDate(d)} ${formatTime(d)}`;

export default function DealDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { deal, events, inviteUrl, error, reload } = useDealDetails(id);
  if (!deal || !events) return <Screen><Loading error={error} onRetry={reload} /></Screen>;
  const { sum, overdue } = dealProgress(deal);
  const cancelReason = (events.find((e) => e.type === 'cancelled')?.data as { reason?: string } | undefined)?.reason;
  return (
    <Screen>
      <Card>
        <Label>№ {deal.no} · создана {formatDate(deal.createdAt)}</Label>
        <H1>{deal.clientName}</H1>
        <Pill kind={deal.stage === 'active' ? 'ok' : deal.stage === 'cancelled' ? 'bad' : 'wait'}>{STAGE_LABEL[deal.stage]}</Pill>
        {overdue && <Pill kind="bad">Просрочено {plural(overdue.count, 'платёж', 'платежа', 'платежей')} на {rub(overdue.amount)}, {days(overdue.days)}</Pill>}
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
        {cancelReason && <Hint>Причина отмены: {cancelReason}</Hint>}
        {EDITABLE.includes(deal.stage) && <Button ghost title="Изменить условия" onPress={() => router.push(`/manager/edit/${deal.id}`)} />}
        <Button ghost title="Открыть сделку глазами клиента" onPress={() => router.push(`/client?t=${encodeURIComponent(deal.token)}`)} />
      </Card>
      <RecordPayment key={`${deal.stage}-${deal.installmentsPaid.length}`} deal={deal} onDone={reload} />
      <Card><InviteCard deal={deal} inviteUrl={inviteUrl ?? null} /></Card>
      {deal.faceMatch != null && <Card><KycPhotos deal={deal} /></Card>}
      <Card>
        <H2>История</H2>
        {events.map((e, i) => (
          <View key={i} style={{ gap: 2 }}>
            <Hint>{time(e.at)}</Hint>
            <Txt>{EVENT_LABEL[e.type] ?? e.type}{paymentText(e.type, e.data)}{byWhom(e.data)}</Txt>
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
        <Button ghost title="Скачать договор в PDF" onPress={() => Linking.openURL(contractPdfUrl(deal.token)).catch(() => {})} />
        {deal.downPayment && <Button ghost title="Справка об оплате в PDF" onPress={() => Linking.openURL(paymentsPdfUrl(deal.token)).catch(() => {})} />}
        <ContractText deal={deal} />
      </Card>
      {deal.stage !== 'cancelled' && !deal.downPayment && <Card><CancelDeal deal={deal} onDone={reload} /></Card>}
    </Screen>
  );
}
