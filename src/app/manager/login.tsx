import { router } from 'expo-router';
import { useState } from 'react';

import { authApi } from '@/api';
import { Button, Card, ErrorText, Field, H2, Hint, Screen } from '@/ui/kit';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await authApi.login(email, password);
      router.replace('/manager');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <H2>Вход для менеджера</H2>
        <Field label="Электронная почта" value={email} onChangeText={setEmail} keyboardType="email-address"
          autoCapitalize="none" autoComplete="email" placeholder="manager@company.ru" />
        <Field label="Пароль" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password"
          onSubmitEditing={submit} />
        <Button title="Войти" onPress={submit} loading={busy} disabled={!email.trim() || !password} />
        {!!error && <ErrorText>{error}</ErrorText>}
        <Hint>Демо-доступ: manager@demo.ru, пароль demo1234</Hint>
      </Card>
    </Screen>
  );
}
