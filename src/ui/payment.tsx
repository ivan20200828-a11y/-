import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { rub } from '@/lib/money';
import type { Deal } from '@/state/types';
import { Button, Hint, KV, Row, Txt } from '@/ui/kit';

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

/** The company's bank details for paying by an ordinary transfer; a manager marks the payment when the money arrives. */
export function TransferDetails({ deal, amount, purpose }: { deal: Deal; amount: number; purpose: string }) {
  const [copied, setCopied] = useState(false);
  const c = deal.sellerDetails;
  if (!c?.account || !c.bik) {
    return <Hint>Реквизиты для перевода пока не указаны. Уточните их у менеджера или оплатите по СБП.</Hint>;
  }
  const text = `Оплата по договору № ${deal.no}, ${purpose}. НДС не облагается`;
  const rows: [string, string][] = [
    ['Получатель', c.name], ['ИНН', c.inn], ...(c.kpp ? [['КПП', c.kpp] as [string, string]] : []),
    ['Банк', c.bank], ['БИК', c.bik], ['Корр. счёт', c.corrAccount], ['Расчётный счёт', c.account],
    ['Сумма', rub(amount)], ['Назначение', text],
  ];
  const copy = async () => {
    await Clipboard.setStringAsync(rows.map(([k, v]) => `${k}: ${v}`).join('\n'));
    setCopied(true);
  };
  return (
    <View style={{ gap: 10 }}>
      <KV rows={rows} />
      <Button ghost title={copied ? 'Реквизиты скопированы' : 'Скопировать реквизиты'} onPress={copy} />
      <Hint>Переведите из приложения своего банка точную сумму с этим назначением. Когда деньги поступят, обычно за 1–2 рабочих дня, менеджер отметит платёж, и он появится в вашем кабинете.</Hint>
    </View>
  );
}
