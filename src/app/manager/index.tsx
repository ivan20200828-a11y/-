import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { rub } from '@/lib/money';
import { dealProgress } from '@/lib/schedule';
import { STAGE_LABEL, useDeals } from '@/state/deals';
import type { Stage } from '@/state/types';
import { Button, Card, H2, Hint, KV, Label, Pill, Progress, Screen, Txt } from '@/ui/kit';

const pillKind = (s: Stage) => (s === 'active' ? 'ok' : s === 'sign' || s === 'pay' ? 'warn' : 'wait');

export default function Deals() {
  const { deals, clientDealId } = useDeals();
  return (
    <Screen wide>
      <Card>
        <H2>Сделки</H2>
        <Hint>Статус меняется, когда клиент проходит этапы. Сделка демо-клиента обновляется, пока вы проходите оформление в режиме «Я клиент».</Hint>
        <Button title="Новая сделка" onPress={() => router.push('/manager/new')} />
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {deals.map((d) => {
          const { sum } = dealProgress(d);
          return (
            <Pressable key={d.id} accessibilityRole="button" onPress={() => router.push(`/manager/${d.id}`)} style={{ flexGrow: 1, flexBasis: 260 }}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <Label>№ {d.no}{d.id === clientDealId ? ' · демо-клиент' : ''}</Label>
                  <Pill kind={pillKind(d.stage)}>{STAGE_LABEL[d.stage]}</Pill>
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
