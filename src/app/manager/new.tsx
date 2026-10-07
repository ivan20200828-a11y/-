import { router } from 'expo-router';

import { ApiError, managerApi } from '@/api';
import { DealForm } from '@/ui/deal-form';
import { Card, H2, Hint, Screen } from '@/ui/kit';

export default function NewDeal() {
  return (
    <Screen>
      <Card>
        <H2>Новая сделка</H2>
        <DealForm submitTitle="Создать сделку и пригласить клиента" onSubmit={async (d) => {
          try {
            const deal = await managerApi.create(d);
            router.replace(`/manager/${deal.id}`);
          } catch (e) {
            if (e instanceof ApiError && e.status === 401) return void router.replace('/manager/login');
            return (e as Error).message;
          }
        }} />
        <Hint>Клиент получит SMS со ссылкой на оформление (в тестовом режиме SMS не отправляется).</Hint>
      </Card>
    </Screen>
  );
}
