import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { rub } from '@/lib/money';
import { authApi } from '@/api';
import { days, dealProgress } from '@/lib/schedule';
import { STAGE_LABEL, useDealList } from '@/state/deals';
import type { Stage } from '@/state/types';
import { Button, Card, H2, Hint, KV, Label, Loading, Pill, Progress, Screen, Txt } from '@/ui/kit';

const pillKind = (s: Stage) => (s === 'active' ? 'ok' : s === 'sign' || s === 'pay' ? 'warn' : 'wait');

export default function Deals() {
  const { deals, error } = useDealList();
  return (
    <Screen wide>
      <Card>
        <H2>Сделки</H2>
        <Hint>Статус меняется, когда клиент проходит этапы. Сделка демо-клиента обновляется, пока вы проходите оформление в разделе «Я клиент».</Hint>
        <Button title="Новая сделка" onPress={() => router.push('/manager/new')} />
        <Button ghost title="Выйти" onPress={async () => { await authApi.logout(); router.replace('/manager/login'); }} />
      </Card>
      {!deals && <Loading error={error} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {deals && overdueFirst(deals).map((d) => {
          const { sum, overdue } = dealProgress(d);
          return (
            <Pressable key={d.id} accessibilityRole="button" onPress={() => router.push(`/manager/${d.id}`)} style={{ flexGrow: 1, flexBasis: 260 }}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <Label>№ {d.no}{d.token === 'demo' ? ' · демо-клиент' : ''}</Label>
                  {overdue
                    ? <Pill kind="bad">Просрочка {days(overdue.days)}</Pill>
                    : <Pill kind={pillKind(d.stage)}>{STAGE_LABEL[d.stage]}</Pill>}
                </View>
                <Txt style={{ fontWeight: '600' }}>{d.clientName}</Txt>
                <Hint>{d.subject}</Hint>
                <KV rows={[['Сумма', rub(d.total)], ['Оплачено', `${Math.round((sum / d.total) * 100)}%`]]} />
                <Progress value={sum / d.total} />
              </Card>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

/** Deals with missed payments go first, the longest overdue on top; the rest keep the server's order. */
function overdueFirst<D extends Parameters<typeof dealProgress>[0]>(deals: D[]) {
  const late = (d: D) => dealProgress(d).overdue?.days ?? -1;
  return deals.map((d, i) => ({ d, i, late: late(d) })).sort((a, b) => b.late - a.late || a.i - b.i).map((x) => x.d);
}
