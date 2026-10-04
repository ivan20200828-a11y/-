import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useClientDeal, useDeals } from '@/state/deals';
import { ContractText } from '@/ui/contract';
import { Button, Card, H2, Hint, Screen, Stepper } from '@/ui/kit';
import { useColors } from '@/ui/theme';

export default function Contract() {
  const deal = useClientDeal();
  const { advance } = useDeals();
  const [agreed, setAgreed] = useState(false);
  const c = useColors();
  return (
    <Screen>
      <Stepper current="contract" />
      <Card>
        <H2>Договор</H2>
        <Hint>Договор составлен из ваших данных. Прочитайте его целиком.</Hint>
        <ContractText deal={deal} />
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} onPress={() => setAgreed(!agreed)}
          style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: agreed ? c.accent : c.line,
            backgroundColor: agreed ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
            {agreed && <Text style={{ color: c.accentFg, fontSize: 13, fontWeight: '700' }}>✓</Text>}
          </View>
          <Text style={{ color: c.fg, fontSize: 15, flex: 1 }}>Я прочитал договор и согласен с условиями и графиком платежей</Text>
        </Pressable>
        <Button title="Перейти к подписанию" disabled={!agreed}
          onPress={() => { advance(deal.id, 'sign'); router.push('/client/sign'); }} />
      </Card>
    </Screen>
  );
}
