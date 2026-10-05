import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { managerApi, type Manager } from '@/api';
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

  const load = useCallback(() => {
    managerApi.team().then(setTeam, (e) => setLoadError((e as Error).message));
  }, []);
  useEffect(load, [load]);

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
          <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <View style={{ flexShrink: 1 }}>
              <Txt style={{ fontWeight: '600' }}>{m.name}</Txt>
              <Hint>{m.email}</Hint>
            </View>
            <Pill kind={m.admin ? 'acc' : 'wait'}>{m.admin ? 'Администратор' : 'Менеджер'}</Pill>
          </View>
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
