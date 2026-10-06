import { useState } from 'react';
import { Linking } from 'react-native';

import { contractPdfUrl } from '@/api';
import { formatDate, rub } from '@/lib/money';
import { days, dealProgress } from '@/lib/schedule';
import { withClientDeal } from '@/state/client-gate';
import { usePayment } from '@/state/payment';
import { downAmount, PAID_BY_LABEL } from '@/state/types';
import { ContractText, ScheduleTable } from '@/ui/contract';
import { PaymentWaiting, TransferDetails } from '@/ui/payment';
import { Big, Button, Card, ErrorText, H1, H2, KV, Label, Pill, Progress, Screen, Stamp, Tabs, Txt } from '@/ui/kit';
import { ContactManager } from '@/ui/contact';

type Tab = 'sched' | 'contract' | 'hist';

export default withClientDeal(function Cabinet({ deal }) {
  const [tab, setTab] = useState<Tab>('sched');
  const { rows, sum, next, overdue } = dealProgress(deal);
  const payment = usePayment(() => setTab('hist'));
  const [transfer, setTransfer] = useState<'next' | 'rest' | null>(null);
  const rest = next ? rows.filter((r) => r.n >= next.n).reduce((a, r) => a + r.amount, 0) : 0;

  return (
    <Screen>
      <Card>
        <Label>Личный кабинет · {deal.passport?.fio ?? deal.clientName}</Label>
        <H1>{deal.subject}</H1>
        <Progress value={sum / deal.total} />
        <KV rows={[['Оплачено', `${rub(sum)} из ${rub(deal.total)}`], ['Осталось', rub(deal.total - sum)]]} />
      </Card>
      {next ? (
        <Card>
          <Label>{overdue ? 'Просроченный платёж' : 'Следующий платёж'}</Label>
          <Big>{rub(next.amount)}</Big>
          <Txt>до {formatDate(next.date)} · платёж {next.n} из {deal.term}</Txt>
          {overdue && (
            <Pill kind="bad">
              {overdue.count > 1 ? `Просрочено платежей: ${overdue.count} на ${rub(overdue.amount)}` : `Просрочен на ${days(overdue.days)}`}
            </Pill>
          )}
          {payment.waiting ? (
            <PaymentWaiting onReopen={payment.reopen} onCancel={payment.cancel} />
          ) : transfer === 'next' ? (
            <>
              <TransferDetails deal={deal} amount={next.amount} purpose={`платёж ${next.n}`} />
              <Button ghost title="Оплатить через СБП" onPress={() => setTransfer(null)} />
            </>
          ) : (
            <>
              <Button title="Оплатить через СБП" onPress={() => payment.start('next', 'sbp')} loading={payment.busy} />
              <Button ghost title="Оплатить переводом по реквизитам" onPress={() => setTransfer('next')} />
            </>
          )}
          {!!payment.error && <ErrorText>{payment.error}</ErrorText>}
        </Card>
      ) : (
        <Card><H2>Рассрочка полностью погашена</H2></Card>
      )}
      {next && rest > next.amount && !payment.waiting && (
        <Card>
          <Label>Досрочное погашение</Label>
          <Big>{rub(rest)}</Big>
          <Txt>Весь остаток одним платежом, без процентов и комиссий. После оплаты рассрочка закрыта.</Txt>
          {transfer === 'rest' ? (
            <>
              <TransferDetails deal={deal} amount={rest} purpose={`досрочное погашение, платежи ${next.n}–${deal.term}`} />
              <Button ghost title="Погасить через СБП" onPress={() => setTransfer(null)} />
            </>
          ) : (
            <>
              <Button ghost title={`Погасить ${rub(rest)} через СБП`} onPress={() => payment.start('rest', 'sbp')} loading={payment.busy} />
              <Button ghost title="Погасить переводом по реквизитам" onPress={() => setTransfer('rest')} />
            </>
          )}
        </Card>
      )}
      <Tabs items={[['sched', 'График'], ['contract', 'Договор'], ['hist', 'История']]} value={tab} onChange={setTab} />
      <Card>
        {tab === 'sched' && <ScheduleTable deal={deal} withStatus />}
        {tab === 'contract' && (
          <>
            {deal.signature && <Stamp>Подписано ПЭП {formatDate(deal.signature.at)} · {deal.signature.id}</Stamp>}
            <Button ghost title="Скачать договор в PDF" onPress={() => Linking.openURL(contractPdfUrl(deal.token)).catch(() => {})} />
            <ContractText deal={deal} />
          </>
        )}
        {tab === 'hist' && (
          <KV rows={[
            ...(deal.downPayment ? [[`${formatDate(deal.downPayment.at)} · взнос, ${PAID_BY_LABEL[deal.downPayment.method]}`, rub(downAmount(deal))] as [string, string]] : []),
            ...deal.installmentsPaid.map((p) => [`${formatDate(p.at)} · платёж ${p.n}, ${PAID_BY_LABEL[p.method] ?? 'СБП'}`, rub(rows[p.n - 1].amount)] as [string, string]),
          ]} />
        )}
      </Card>
      <ContactManager deal={deal} />
    </Screen>
  );
});
