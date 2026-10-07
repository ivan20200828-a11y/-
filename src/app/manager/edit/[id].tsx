import { router, useLocalSearchParams } from 'expo-router';

import { ApiError, managerApi } from '@/api';
import { EDITABLE, useDealDetails } from '@/state/deals';
import { DealForm } from '@/ui/deal-form';
import { Card, H2, Hint, Loading, Screen } from '@/ui/kit';

export default function EditDeal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { deal, error, reload } = useDealDetails(id);
  if (!deal) return <Screen><Loading error={error} onRetry={reload} /></Screen>;
  if (!EDITABLE.includes(deal.stage)) {
    return <Screen><Card><H2>Условия уже приняты</H2><Hint>Клиент принял договор, поэтому условия сделки больше не меняются. Если нужно, отмените сделку и создайте новую.</Hint></Card></Screen>;
  }
  return (
    <Screen>
      <Card>
        <H2>Изменить сделку № {deal.no}</H2>
        <DealForm initial={deal} submitTitle="Сохранить изменения"
          nameLocked={deal.passport ? 'Взято из паспорта клиента.' : undefined}
          phoneLocked={deal.stage !== 'invited' ? 'Клиент уже подтверждает его сам.' : undefined}
          onSubmit={async (d) => {
            try {
              await managerApi.update(deal.id, d);
              router.back();
            } catch (e) {
              if (e instanceof ApiError && e.status === 401) return void router.replace('/manager/login');
              return (e as Error).message;
            }
          }} />
        {deal.stage === 'contract' && <Hint>Клиент сейчас читает договор. После сохранения он увидит новые условия и прочитает их заново.</Hint>}
      </Card>
    </Screen>
  );
}
