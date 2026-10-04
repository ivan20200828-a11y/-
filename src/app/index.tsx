import { router } from 'expo-router';

import { Button, Card, H1, H2, Hint, Screen } from '@/ui/kit';

export default function Home() {
  return (
    <Screen>
      <Card>
        <H1>Сделка онлайн</H1>
        <Hint>Удалённое оформление сделок: проверка личности, договор, подпись по SMS, первоначальный взнос и график платежей.</Hint>
      </Card>
      <Card>
        <H2>Я клиент</H2>
        <Hint>Оформить сделку по приглашению и открыть личный кабинет.</Hint>
        <Button title="Открыть мою сделку" onPress={() => router.push('/client')} />
      </Card>
      <Card>
        <H2>Я менеджер</H2>
        <Hint>Создавать сделки и следить, на каком этапе клиент.</Hint>
        <Button ghost title="Открыть список сделок" onPress={() => router.push('/manager')} />
      </Card>
    </Screen>
  );
}
