import { useState } from 'react';
import { Linking } from 'react-native';

import { contractPdfUrl } from '@/api';
import { formatDate, rub } from '@/lib/money';
import { days, dealProgress } from '@/lib/schedule';
import { withClientDeal } from '@/state/client-gate';
import { usePayment } from '@/state/payment';
import { downAmount } from '@/state/types';
import { ContractText, ScheduleTable } from '@/ui/contract';
import { PaymentWaiting } from '@/ui/payment';
import { Big, Button, Card, ErrorText, H1, H2, KV, Label, Pill, Progress, Screen, Stamp, Tabs, Txt } from '@/ui/kit';

type Tab = 'sched' | 'contract' | 'hist';

export default withClientDeal(function Cabinet({ deal }) {
  const [tab, setTab] = useState<Tab>('sched');
  const { rows, sum, next, overdue } = dealProgress(deal);
  const payment = usePayment(() => setTab('hist'));

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
          ) : (
            <Button title="Оплатить через СБП" onPress={() => payment.start('next', 'sbp')} loading={payment.busy} />
          )}
          {!!payment.error && <ErrorText>{payment.error}</ErrorText>}
        </Card>
      ) : (
        <Card><H2>Рассрочка полностью погашена</H2></Card>
      )}
      <Tabs items={[['sched', 'График'], ['contract', 'Договор'], ['hist', 'История']]} value={tab} onChange={setTab} />
      <Card>
        {tab === 'sched' && <ScheduleTable deal={deal} withStatus />}
        {tab === 'contract' && (
          <>
            {deal.signature && <Stamp>Подписано ПЭП {formatDate(deal.signature.at)} · {deal.signature.id}</Stamp>}
            <Button ghost title="Скачать договор в PDF" onPress={() => Linking.openURL(contractPdfUrl(deal.token))} />
            <ContractText deal={deal} />
          </>
        )}
        {tab === 'hist' && (
          <KV rows={[
            ...(deal.downPayment ? [[`${formatDate(deal.downPayment.at)} · взнос, ${deal.downPayment.method === 'sbp' ? 'СБП' : 'карта'}`, rub(downAmount(deal))] as [string, string]] : []),
            ...deal.installmentsPaid.map((p) => [`${formatDate(p.at)} · платёж ${p.n}, СБП`, rub(rows[p.n - 1].amount)] as [string, string]),
          ]} />
        )}
      </Card>
    </Screen>
  );
});
