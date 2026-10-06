import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { authApi, managerApi, type Manager } from '@/api';
import { Button, Card, Checkbox, ErrorText, Field, H2, Hint, Loading, Pill, Row, Screen, Txt } from '@/ui/kit';

/** The admin's list of colleagues with access to the manager's cabinet, and a form to add one. */
export default function Team() {
  const [team, setTeam] = useState<Manager[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState('');

  const [meId, setMeId] = useState<number | null>(null);
  const load = useCallback(() => {
    managerApi.team().then(setTeam, (e) => setLoadError((e as Error).message));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    authApi.me().then((m) => setMeId(m.id), () => {});
  }, []);

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      const m = await managerApi.addColleague({ name, email, password, admin });
      setAdded(`${m.name} может входить с почтой ${m.email} и паролем, который вы задали. Передайте пароль лично.`);
      setName(''); setEmail(''); setPassword(''); setAdmin(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <H2>Сотрудники</H2>
        {!team ? <Loading error={loadError} onRetry={load} /> : team.map((m) => (
          <Colleague key={m.id} m={m} isMe={m.id === meId} onChanged={load} />
        ))}
      </Card>
      <Card>
        <H2>Добавить сотрудника</H2>
        <Hint>Сотрудник видит все сделки и может создавать новые. Администратор ещё и добавляет сотрудников.</Hint>
        <Row>
          <Field label="Имя" value={name} onChangeText={setName} placeholder="Анна Петрова" />
          <Field label="Почта" value={email} onChangeText={setEmail} placeholder="anna@company.ru" keyboardType="email-address" autoCapitalize="none" />
        </Row>
        <Field label="Пароль, не короче 8 символов" value={password} onChangeText={setPassword} secureTextEntry />
        <Checkbox checked={admin} onChange={setAdmin}>Сделать администратором</Checkbox>
        <Button title="Добавить" onPress={add} loading={busy} disabled={!name.trim() || !email.trim() || password.length < 8} />
        {!!error && <ErrorText>{error}</ErrorText>}
        {!!added && <Hint>{added}</Hint>}
      </Card>
    </Screen>
  );
}

/** One colleague in the list: role, and for an admin a new password and turning access off or on. */
function Colleague({ m, isMe, onChanged }: { m: Manager; isMe: boolean; onChanged: () => void }) {
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setNote(done);
      setResetting(false);
      setPassword('');
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 8, paddingVertical: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <View style={{ flexShrink: 1 }}>
          <Txt style={{ fontWeight: '600' }}>{m.name}{isMe ? ' (вы)' : ''}</Txt>
          <Hint>{m.email}</Hint>
        </View>
        {m.disabled
          ? <Pill kind="bad">Доступ отключён</Pill>
          : <Pill kind={m.admin ? 'acc' : 'wait'}>{m.admin ? 'Администратор' : 'Менеджер'}</Pill>}
      </View>
      {!isMe && !resetting && (
        <Row>
          {!m.disabled && <Button ghost title="Новый пароль" onPress={() => { setResetting(true); setNote(''); }} />}
          <Button ghost title={m.disabled ? 'Вернуть доступ' : 'Отключить доступ'} loading={busy}
            onPress={() => run(() => managerApi.setDisabled(m.id, !m.disabled), m.disabled ? `${m.name} снова может входить.` : `${m.name} больше не может входить, сделки остаются.`)} />
        </Row>
      )}
      {resetting && (
        <>
          <Field label={`Новый пароль для ${m.name}, не короче 8 символов`} value={password} onChangeText={setPassword} secureTextEntry />
          <Row>
            <Button title="Сохранить пароль" loading={busy} disabled={password.length < 8}
              onPress={() => run(() => managerApi.resetPassword(m.id, password), 'Пароль изменён. Передайте его сотруднику лично.')} />
            <Button ghost title="Отмена" onPress={() => setResetting(false)} />
          </Row>
        </>
      )}
      {!!note && <Hint>{note}</Hint>}
      {!!error && <ErrorText>{error}</ErrorText>}
    </View>
  );
}
