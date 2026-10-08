import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';

import { rub } from '@/lib/money';
import { authApi, companyApi, exportUrl, type Manager } from '@/api';
import { days, dealProgress, portfolio, stuckDays } from '@/lib/schedule';
import { STAGE_LABEL, useDealList } from '@/state/deals';
import type { Deal, Stage } from '@/state/types';
import { useColors } from '@/ui/theme';
import { Button, Card, ErrorText, Field, H2, Hint, KV, Label, Loading, Pill, Progress, Row, Screen, Tabs, Txt } from '@/ui/kit';

const pillKind = (s: Stage) => (s === 'active' ? 'ok' : s === 'cancelled' ? 'bad' : s === 'sign' || s === 'pay' ? 'warn' : 'wait');

type Filter = 'all' | 'onboarding' | 'stuck' | 'active' | 'overdue' | 'cancelled';
const FILTERS: [Filter, string][] = [
  ['all', 'Все'], ['onboarding', 'Оформление'], ['stuck', 'Застряли'], ['active', 'Платежи'], ['overdue', 'Просрочка'], ['cancelled', 'Отменённые'],
];

const matchesFilter = (d: Deal, f: Filter) =>
  f === 'all' ? true
  : f === 'overdue' ? !!dealProgress(d).overdue
  : f === 'stuck' ? stuckDays(d) != null
  : f === 'active' ? d.stage === 'active'
  : f === 'cancelled' ? d.stage === 'cancelled'
  : d.stage !== 'active' && d.stage !== 'cancelled';

/** Search by client name, phone (digits only are enough), deal number or subject. */
const matchesSearch = (d: Deal, q: string) => {
  const text = q.trim().toLowerCase();
  if (!text) return true;
  // 8 925… and +7 925… are the same number.
  const phoneDigits = (s: string) => s.replace(/\D/g, '').replace(/^8(?=\d{3})/, '7');
  const digits = phoneDigits(text);
  return [d.clientName, d.no, d.subject].some((v) => v.toLowerCase().includes(text))
    || (digits.length >= 3 && phoneDigits(d.phone).includes(digits));
};

export default function Deals() {
  const { deals, error } = useDealList();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [me, setMe] = useState<Manager | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  useEffect(() => {
    authApi.me().then((m) => {
      setMe(m);
      if (m.admin) companyApi.get().then((r) => setMissing(r.missing), () => {});
    }, () => {});
  }, []);
  const shown = deals ? overdueFirst(deals).filter((d) => matchesFilter(d, filter) && matchesSearch(d, search)) : null;
  return (
    <Screen wide>
      <Card>
        <H2>Сделки</H2>
        <Hint>Статус меняется, когда клиент проходит этапы. Сделка демо-клиента обновляется, пока вы проходите оформление в разделе «Я клиент».</Hint>
        <Button title="Новая сделка" onPress={() => router.push('/manager/new')} />
        <Row>
          {me?.admin && <Button ghost title="Сотрудники" onPress={() => router.push('/manager/team')} />}
          {me?.admin && <Button ghost title="Компания" onPress={() => router.push('/manager/company')} />}
          <Button ghost title="Подключить телефон" onPress={() => router.push('/manager/connect')} />
          <Button ghost title="Сменить пароль" onPress={() => router.push('/manager/password')} />
          <Button ghost title="Выйти" onPress={async () => { await authApi.logout(); router.replace('/manager/login'); }} />
        </Row>
      </Card>
      {me?.knownPassword && (
        <Card>
          <Txt style={{ fontWeight: '600' }}>Смените пароль</Txt>
          <Hint>Вы входите с паролем из инструкции. Его знает любой, кто её видел, поэтому перед работой с клиентами задайте свой.</Hint>
          <Button title="Сменить пароль" onPress={() => router.push('/manager/password')} />
        </Card>
      )}
      {missing.length > 0 && (
        <Card>
          <Txt style={{ fontWeight: '600' }}>Заполните реквизиты компании</Txt>
          <Hint>Без них в договоре не будет: {missing.join(', ')}.</Hint>
          <Button ghost title="Заполнить" onPress={() => router.push('/manager/company')} />
        </Card>
      )}
      {deals && <Summary deals={deals} />}
      <Field label="Поиск" value={search} onChangeText={setSearch} placeholder="ФИО, телефон, номер сделки или предмет" />
      <Tabs items={FILTERS} value={filter} onChange={setFilter} />
      {!deals && <Loading error={error} />}
      {shown && shown.length === 0 && <Hint>Сделок не найдено. Измените поиск или выберите другой фильтр.</Hint>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {shown?.map((d) => {
          const { sum, overdue } = dealProgress(d);
          return (
            <Pressable key={d.id} accessibilityRole="button" onPress={() => router.push(`/manager/${d.id}`)} style={{ flexGrow: 1, flexBasis: 260 }}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <Label>№ {d.no}{d.token === 'demo' ? ' · демо-клиент' : ''}</Label>
                  {overdue
                    ? <Pill kind="bad">Просрочка {days(overdue.days)}</Pill>
                    : <Pill kind={pillKind(d.stage)}>{STAGE_LABEL[d.stage]}</Pill>}
                  {stuckDays(d) != null && <Pill kind="warn">Нет движения {days(stuckDays(d)!)}</Pill>}
                </View>
                <Txt style={{ fontWeight: '600' }}>{d.clientName}</Txt>
                <Hint>{d.subject}</Hint>
                <KV rows={[['Сумма', rub(d.total)], ['Оплачено', `${Math.round((sum / d.total) * 100)}%`]]} />
                <Progress value={sum / d.total} />
              </Card>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

/** Deals with missed payments go first, the longest overdue on top; the rest keep the server's order. */
function overdueFirst<D extends Parameters<typeof dealProgress>[0]>(deals: D[]) {
  const late = (d: D) => dealProgress(d).overdue?.days ?? -1;
  return deals.map((d, i) => ({ d, i, late: late(d) })).sort((a, b) => b.late - a.late || a.i - b.i).map((x) => x.d);
}

function Summary({ deals }: { deals: Deal[] }) {
  const s = portfolio(deals);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const download = async (kind: 'payments.csv' | 'deals.csv') => {
    setBusy(kind);
    setError('');
    try {
      const url = await exportUrl(kind);
      if (Platform.OS === 'web') window.location.href = url;
      else await Linking.openURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  return (
    <Card>
      <H2>Деньги</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Stat label="Получено всего" value={rub(s.collected)} />
        <Stat label="В этом месяце" value={rub(s.month)} />
        <Stat label="Ожидается за 30 дней" value={rub(s.expected)} />
        <Stat label="Просрочено" value={rub(s.overdue)} note={s.overdueDeals ? `в ${s.overdueDeals} ${s.overdueDeals === 1 ? 'сделке' : 'сделках'}` : 'нет'} bad={s.overdue > 0} />
      </View>
      <Hint>Сделок на оформлении: {s.onboarding}, на выплате: {s.active}.</Hint>
      <Row>
        <Button ghost title="Выгрузить платежи" loading={busy === 'payments.csv'} onPress={() => download('payments.csv')} />
        <Button ghost title="Выгрузить сделки" loading={busy === 'deals.csv'} onPress={() => download('deals.csv')} />
      </Row>
      <Hint>Таблицы открываются в Excel и Google Таблицах.</Hint>
      {!!error && <ErrorText>{error}</ErrorText>}
    </Card>
  );
}

function Stat({ label, value, note, bad }: { label: string; value: string; note?: string; bad?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexGrow: 1, flexBasis: 140, gap: 2 }}>
      <Label>{label}</Label>
      <Txt style={{ fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'], ...(bad ? { color: c.seal } : {}) }}>{value}</Txt>
      {note && <Hint>{note}</Hint>}
    </View>
  );
}
