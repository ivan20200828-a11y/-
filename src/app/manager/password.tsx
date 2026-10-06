import { router } from 'expo-router';
import { useState } from 'react';

import { authApi } from '@/api';
import { Button, Card, ErrorText, Field, H2, Hint, Screen } from '@/ui/kit';

/** The signed-in manager changes their own password. */
export default function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const save = async () => {
    if (next !== repeat) return setError('Новые пароли не совпадают');
    setBusy(true);
    setError('');
    try {
      await authApi.changePassword(current, next);
      setDone(true);
      setCurrent(''); setNext(''); setRepeat('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <H2>Смена пароля</H2>
        <Hint>После смены пароля вход на других устройствах закончится, а здесь вы останетесь в кабинете.</Hint>
        <Field label="Текущий пароль" value={current} onChangeText={setCurrent} secureTextEntry />
        <Field label="Новый пароль, не короче 8 символов" value={next} onChangeText={setNext} secureTextEntry />
        <Field label="Новый пароль ещё раз" value={repeat} onChangeText={setRepeat} secureTextEntry />
        <Button title="Сменить пароль" onPress={save} loading={busy} disabled={!current || next.length < 8 || !repeat} />
        {!!error && <ErrorText>{error}</ErrorText>}
        {done && <Hint>Пароль изменён.</Hint>}
        {done && <Button ghost title="К сделкам" onPress={() => router.replace('/manager')} />}
      </Card>
    </Screen>
  );
}
