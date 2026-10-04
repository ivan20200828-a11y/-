import { useState } from 'react';
import { Linking } from 'react-native';

import { contractPdfUrl } from '@/api';
import { formatDate, rub } from '@/lib/money';
import { dealProgress } from '@/lib/schedule';
import { withClientDeal } from '@/state/client-gate';
import { useClient } from '@/state/deals';
import { downAmount } from '@/state/types';
import { ContractText, ScheduleTable } from '@/ui/contract';
import { Big, Button, Card, ErrorText, H1, H2, KV, Label, Progress, Screen, Stamp, Tabs, Txt } from '@/ui/kit';

type Tab = 'sched' | 'contract' | 'hist';

export default withClientDeal(function Cabinet({ deal }) {
  const { step } = useClient();
  const [tab, setTab] = useState<Tab>('sched');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { rows, sum, next } = dealProgress(deal);

  const payNext = async () => {
    if (!next) return;
    setBusy(true);
    const err = await step('pay', { what: 'next', method: 'sbp' });
    setBusy(false);
    if (err) return setError(err);
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
          {!!error && <ErrorText>{error}</ErrorText>}
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
