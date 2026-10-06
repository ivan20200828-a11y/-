import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { parseAmount, rub } from '@/lib/money';
import { ApiError, managerApi } from '@/api';
import { Button, Card, ErrorText, Field, H2, Hint, Row, Screen } from '@/ui/kit';
import { useColors } from '@/ui/theme';

const TERMS = [3, 6, 12, 18, 24, 36];

export default function NewDeal() {
  const c = useColors();
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [total, setTotal] = useState('');
  const [downPct, setDownPct] = useState('20');
  const [term, setTerm] = useState(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sum = parseAmount(total);
  const pct = Math.min(100, parseAmount(downPct));
  const down = Math.round((sum * pct) / 100);
  const digits = phone.replace(/\D/g, '');
  const phoneOk = /^[78]\d{10}$/.test(digits);
  const pctOk = pct >= 1 && pct <= 99;
  const restOk = sum - down >= term;
  const valid = clientName.trim() && subject.trim() && phoneOk && sum > 0 && pctOk && restOk;
  const problem = digits.length >= 11 && !phoneOk ? 'Нужен российский номер: +7 и 10 цифр.'
    : downPct !== '' && !pctOk ? 'Взнос указывается от 1 до 99%.'
    : sum > 0 && !restOk ? 'Сумма рассрочки слишком мала для такого срока.' : '';

  const submit = async () => {
    setBusy(true);
    try {
      const deal = await managerApi.create({ clientName: clientName.trim(), phone, subject: subject.trim(), total: sum, downPct: pct, term });
      router.replace(`/manager/${deal.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return router.replace('/manager/login');
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <H2>Новая сделка</H2>
        <Field label="ФИО клиента" value={clientName} onChangeText={setClientName} placeholder="Иванов Иван Иванович" />
        <Field label="Телефон клиента" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+7 900 000-00-00" />
        <Field label="Предмет сделки" value={subject} onChangeText={setSubject} placeholder="Например, автомобиль или квартира" />
        <Row>
          <Field label="Стоимость, ₽" value={total} onChangeText={setTotal} keyboardType="number-pad" placeholder="1 500 000" />
          <Field label="Взнос, %" value={downPct} onChangeText={setDownPct} keyboardType="number-pad" />
        </Row>
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.muted, fontSize: 13 }}>Срок рассрочки, мес.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {TERMS.map((m) => (
              <Pressable key={m} accessibilityRole="radio" accessibilityState={{ selected: m === term }} onPress={() => setTerm(m)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: m === term ? c.accent : c.line, backgroundColor: m === term ? c.accentSoft : c.surface }}>
                <Text style={{ color: m === term ? c.accent : c.fg, fontWeight: '600' }}>{m}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        {sum > 0 && pctOk && restOk && <Hint>Взнос {rub(down)}, затем {term} платежей по {rub((sum - down) / term)}.</Hint>}
        {!!problem && <ErrorText>{problem}</ErrorText>}
        <Button title="Создать сделку и пригласить клиента" onPress={submit} disabled={!valid} loading={busy} />
        {!!error && <ErrorText>{error}</ErrorText>}
        <Hint>Клиент получит SMS со ссылкой на оформление (в тестовом режиме SMS не отправляется).</Hint>
      </Card>
    </Screen>
  );
}
