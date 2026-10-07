import { router } from 'expo-router';
import { useState } from 'react';

import { serverUrl } from '@/api';
import { DEMO_TOKEN, useClient } from '@/state/deals';
import { Button, Card, Field, H1, H2, Hint, Screen } from '@/ui/kit';

export default function Home() {
  const { token } = useClient();
  const [code, setCode] = useState('');
  const hasDeal = !!token && token !== DEMO_TOKEN;
  // An invitation SMS without a link carries the code; it may be pasted with spaces around it.
  const open = () => router.push(`/client?t=${encodeURIComponent(code.trim())}`);
  return (
    <Screen>
      <Card>
        <H1>Сделка онлайн</H1>
        <Hint>Удалённое оформление сделок: проверка личности, договор, подпись по SMS, первоначальный взнос и график платежей.</Hint>
      </Card>
      <Card>
        <H2>Я клиент</H2>
        <Hint>Оформить сделку по приглашению и открыть личный кабинет.</Hint>
        {hasDeal && <Button title="Открыть мою сделку" onPress={() => router.push('/client')} />}
        <Field label="Код приглашения из SMS" value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false}
          onSubmitEditing={() => code.trim() && open()} />
        <Button ghost={hasDeal} title="Открыть по коду" disabled={!code.trim()} onPress={open} />
        <Button ghost title="Посмотреть демо-сделку" onPress={() => router.push(`/client?t=${DEMO_TOKEN}`)} />
      </Card>
      <Card>
        <H2>Я менеджер</H2>
        <Hint>Создавать сделки и следить, на каком этапе клиент.</Hint>
        <Button ghost title="Открыть список сделок" onPress={() => router.push('/manager')} />
      </Card>
      {serverUrl.canChange && (
        <Card>
          <Hint>Сервер: {serverUrl.get()}</Hint>
          <Button ghost title="Изменить адрес сервера" onPress={() => router.push('/server')} />
        </Card>
      )}
    </Screen>
  );
}
