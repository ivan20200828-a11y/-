import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Image, Platform, View } from 'react-native';

import { managerApi } from '@/api';
import { rub } from '@/lib/money';
import { dealProgress } from '@/lib/schedule';
import { downAmount, type Deal, type PaidBy, type PayWhat } from '@/state/types';
import { Button, Card, ErrorText, Field, H2, Hint, Row, Tabs, Txt } from '@/ui/kit';

/** The client's link to the deal, with copy and resend. */
export function InviteCard({ deal, inviteUrl }: { deal: Deal; inviteUrl: string | null }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const url = inviteUrl
    ?? (Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/client?t=${encodeURIComponent(deal.token)}` : null);
  const open = deal.stage !== 'active' && deal.stage !== 'cancelled';

  const copy = async () => {
    await Clipboard.setStringAsync(url ?? deal.token);
    setNote(url ? 'Ссылка скопирована. Её можно отправить клиенту в мессенджере.' : 'Код приглашения скопирован.');
  };
  const resend = async () => {
    setBusy(true);
    setError('');
    try {
      await managerApi.resendInvite(deal.id);
      setNote(`SMS с приглашением отправлено на ${deal.phone}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <H2>Приглашение клиента</H2>
      <Txt selectable style={{ fontSize: 14 }}>{url ?? `Код приглашения: ${deal.token}`}</Txt>
      <Row>
        <Button ghost title={url ? 'Скопировать ссылку' : 'Скопировать код'} onPress={copy} />
        {open && <Button ghost title="Отправить SMS ещё раз" onPress={resend} loading={busy} />}
      </Row>
      {!!note && <Hint>{note}</Hint>}
      {!!error && <ErrorText>{error}</ErrorText>}
    </View>
  );
}

/** Passport and selfie photos the client uploaded, loaded only when the manager asks. */
export function KycPhotos({ deal }: { deal: Deal }) {
  const [images, setImages] = useState<Awaited<ReturnType<typeof managerApi.kyc>> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try {
      setImages(await managerApi.kyc(deal.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <H2>Фото из проверки</H2>
      {!images ? (
        <Button ghost title="Показать паспорт и селфи" onPress={load} loading={busy} />
      ) : !images.passport && !images.selfie ? (
        <Hint>Клиент не загружал фото: данные заполнены вручную или пример в тестовом режиме.</Hint>
      ) : (
        <Row>
          {(['passport', 'selfie'] as const).map((k) => images[k] && (
            <View key={k} style={{ gap: 6, flexGrow: 1, flexBasis: 220 }}>
              <Hint>{k === 'passport' ? 'Разворот паспорта' : 'Селфи с паспортом'}</Hint>
              <Image source={{ uri: images[k].url }} resizeMode="contain" style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 10 }}
                accessibilityLabel={k === 'passport' ? 'Фото паспорта' : 'Селфи'} />
            </View>
          ))}
        </Row>
      )}
      {!!error && <ErrorText>{error}</ErrorText>}
    </View>
  );
}

/** Cancelling asks for a reason first; a deal with money on it is refunded instead. */
export function CancelDeal({ deal, onDone }: { deal: Deal; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (deal.stage === 'cancelled' || deal.downPayment) return null;
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await managerApi.cancel(deal.id, reason);
      setAsking(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!asking) return <Button ghost title="Отменить сделку" onPress={() => setAsking(true)} />;
  return (
    <View style={{ gap: 10 }}>
      <H2>Отмена сделки</H2>
      <Hint>Клиент увидит, что сделка отменена, и не сможет продолжить оформление. Вернуть сделку нельзя.</Hint>
      <Field label="Причина" value={reason} onChangeText={setReason} placeholder="Например, клиент передумал" />
      <Row>
        <Button title="Отменить сделку" onPress={confirm} loading={busy} disabled={!reason.trim()} />
        <Button ghost title="Не отменять" onPress={() => setAsking(false)} />
      </Row>
      {!!error && <ErrorText>{error}</ErrorText>}
    </View>
  );
}

/** Marks a payment that came outside the app: a bank transfer by the company's requisites or cash at the office. */
export function RecordPayment({ deal, onDone }: { deal: Deal; onDone: () => void }) {
  const { rows, next } = dealProgress(deal);
  const [asking, setAsking] = useState(false);
  const [what, setWhat] = useState<PayWhat>(deal.stage === 'pay' ? 'down' : 'next');
  const [method, setMethod] = useState<PaidBy>('transfer');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (deal.stage !== 'pay' && !(deal.stage === 'active' && next)) return null;

  const rest = next ? rows.filter((r) => r.n >= next.n).reduce((a, r) => a + r.amount, 0) : 0;
  const choices: [PayWhat, string][] = deal.stage === 'pay'
    ? [['down', 'Взнос']]
    : rest > (next?.amount ?? 0) ? [['next', `Платёж ${next!.n}`], ['rest', 'Весь остаток']] : [['next', `Платёж ${next!.n}`]];
  const amount = what === 'down' ? downAmount(deal) : what === 'rest' ? rest : next?.amount ?? 0;

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await managerApi.recordPayment(deal.id, { what, method, note });
      setAsking(false);
      setNote('');
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!asking) return <Card><Button ghost title="Отметить оплату вне приложения" onPress={() => setAsking(true)} /></Card>;
  return (
    <Card>
      <H2>Оплата вне приложения</H2>
      <Hint>Отметьте, когда деньги пришли на счёт или приняты в кассу. Клиент сразу увидит платёж в кабинете.</Hint>
      <Tabs items={choices} value={what} onChange={setWhat} />
      <Tabs items={[['transfer', 'Перевод по реквизитам'], ['cash', 'Наличные']]} value={method} onChange={setMethod} />
      <Txt style={{ fontWeight: '600' }}>Сумма: {rub(amount)}</Txt>
      <Field label="Комментарий" value={note} onChangeText={setNote} placeholder={method === 'cash' ? 'Например, ПКО № 15' : 'Например, платёжное поручение № 42'} />
      <Row>
        <Button title={`Отметить ${rub(amount)}`} onPress={confirm} loading={busy} />
        <Button ghost title="Отмена" onPress={() => setAsking(false)} />
      </Row>
      {!!error && <ErrorText>{error}</ErrorText>}
    </Card>
  );
}
