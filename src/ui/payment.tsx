import { ActivityIndicator, View } from 'react-native';

import { Button, Hint, Row, Txt } from '@/ui/kit';

/** Shown while the bank has not confirmed the payment yet. */
export function PaymentWaiting({ onReopen, onCancel }: { onReopen: () => void; onCancel: () => void }) {
  return (
    <View style={{ gap: 12 }}>
      <Row>
        <ActivityIndicator />
        <Txt>Ждём подтверждения от банка</Txt>
      </Row>
      <Hint>Завершите оплату в приложении банка или на открывшейся странице. Этот экран обновится сам.</Hint>
      <Row>
        <Button ghost title="Открыть оплату снова" onPress={onReopen} />
        <Button ghost title="Выбрать другой способ" onPress={onCancel} />
      </Row>
    </View>
  );
}
