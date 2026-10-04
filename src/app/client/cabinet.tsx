import { router } from 'expo-router';
import { useState } from 'react';

import { formatDate, rub } from '@/lib/money';
import { dealProgress } from '@/lib/schedule';
import { payments } from '@/services';
import { useClientDeal, useDeals } from '@/state/deals';
import { downAmount } from '@/state/types';
import { ContractText, ScheduleTable } from '@/ui/contract';
import { Big, Button, Card, H1, H2, KV, Label, Progress, Screen, Stamp, Tabs, Txt } from '@/ui/kit';

type Tab = 'sched' | 'contract' | 'hist';

export default function Cabinet() {
  const deal = useClientDeal();
  const { update, resetClientDeal } = useDeals();
  const [tab, setTab] = useState<Tab>('sched');
  const [busy, setBusy] = useState(false);
  const { rows, sum, next } = dealProgress(deal);

  const payNext = async () => {
    if (!next) return;
    setBusy(true);
    const res = await payments.pay(next.amount, 'sbp');
    setBusy(false);
    update(deal.id, { installmentsPaid: [...deal.installmentsPaid, { n: next.n, at: res.at }] });
    setTab('hist');
  };

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
          <Label>Следующий платёж</Label>
          <Big>{rub(next.amount)}</Big>
          <Txt>до {formatDate(next.date)} · платёж {next.n} из {deal.term}</Txt>
          <Button title="Оплатить через СБП" onPress={payNext} loading={busy} />
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
      <Button ghost title="Пройти оформление заново (демо)" onPress={() => { resetClientDeal(); router.replace('/client'); }} />
    </Screen>
  );
}
