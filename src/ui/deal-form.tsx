import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { DealTerms } from '@/api';
import { parseAmount, rub } from '@/lib/money';
import { Button, ErrorText, Field, Hint, Row } from '@/ui/kit';
import { useColors } from '@/ui/theme';

const TERMS = [3, 6, 12, 18, 24, 36];

/** The deal's terms as a manager types them; checked here with the same rules as on the server. */
export function DealForm({ initial, submitTitle, onSubmit, nameLocked, phoneLocked }: {
  initial?: DealTerms;
  submitTitle: string;
  /** Returns an error text to show, or nothing when done. */
  onSubmit: (d: DealTerms) => Promise<string | void>;
  /** Shown as a hint instead of letting the field change. */
  nameLocked?: string;
  phoneLocked?: string;
}) {
  const c = useColors();
  const [clientName, setClientName] = useState(initial?.clientName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [total, setTotal] = useState(initial ? String(initial.total) : '');
  const [downPct, setDownPct] = useState(String(initial?.downPct ?? 20));
  const [term, setTerm] = useState(initial?.term ?? 12);
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
  // A term from an older deal that is not among the usual ones stays selectable.
  const terms = TERMS.includes(term) ? TERMS : [...TERMS, term].sort((a, b) => a - b);

  const submit = async () => {
    if (busy || !valid) return;
    setBusy(true);
    setError('');
    const err = await onSubmit({ clientName: clientName.trim(), phone, subject: subject.trim(), total: sum, downPct: pct, term });
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <>
      {nameLocked
        ? <Hint>ФИО: {clientName}. {nameLocked}</Hint>
        : <Field label="ФИО клиента" value={clientName} onChangeText={setClientName} placeholder="Иванов Иван Иванович" />}
      {phoneLocked
        ? <Hint>Телефон: {phone}. {phoneLocked}</Hint>
        : <Field label="Телефон клиента" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+7 900 000-00-00" />}
      <Field label="Предмет сделки" value={subject} onChangeText={setSubject} placeholder="Например, автомобиль или квартира" />
      <Row>
        <Field label="Стоимость, ₽" value={total} onChangeText={setTotal} keyboardType="number-pad" placeholder="1 500 000" />
        <Field label="Взнос, %" value={downPct} onChangeText={setDownPct} keyboardType="number-pad" />
      </Row>
      <View style={{ gap: 6 }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>Срок рассрочки, мес.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {terms.map((m) => (
            <Pressable key={m} accessibilityRole="radio" accessibilityState={{ selected: m === term }} onPress={() => setTerm(m)}
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: m === term ? c.accent : c.line, backgroundColor: m === term ? c.accentSoft : c.surface }}>
              <Text style={{ color: m === term ? c.accent : c.fg, fontWeight: '600' }}>{m}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {sum > 0 && pctOk && restOk && <Hint>Взнос {rub(down)}, затем {term} платежей по {rub((sum - down) / term)}.</Hint>}
      {!!problem && <ErrorText>{problem}</ErrorText>}
      <Button title={submitTitle} onPress={submit} disabled={!valid} loading={busy} />
      {!!error && <ErrorText>{error}</ErrorText>}
    </>
  );
}
