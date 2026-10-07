import { router } from 'expo-router';
import { useState } from 'react';

import { serverUrl } from '@/api';
import { Button, Card, ErrorText, Field, H2, Hint, Screen } from '@/ui/kit';

/** Where the phone app finds the server: the built-in address or another one, e.g. a computer in the office Wi-Fi. */
export default function ServerAddress() {
  const [url, setUrl] = useState(serverUrl.get());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const apply = async (next: string | null) => {
    setBusy(true);
    setError('');
    try {
      await serverUrl.set(next);
      // Deals and sign-ins belong to the old server: start again from the home screen.
      router.replace('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card>
        <H2>Адрес сервера</H2>
        <Hint>Приложение работает с сервером «Сделки онлайн». Обычно менять адрес не нужно.</Hint>
        <Hint>Чтобы попробовать приложение с сервером на своём компьютере, запустите его (start.bat или start.command) и впишите адрес компьютера в той же сети Wi-Fi, например http://192.168.1.10:3000.</Hint>
        <Field label="Адрес" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Button title="Проверить и сохранить" onPress={() => apply(url)} loading={busy} disabled={!url.trim()} />
        {url !== serverUrl.builtIn && <Button ghost title="Вернуть встроенный адрес" onPress={() => apply(null)} disabled={busy} />}
        {!!error && <ErrorText>{error}</ErrorText>}
        <Hint>Встроенный адрес: {serverUrl.builtIn}</Hint>
      </Card>
    </Screen>
  );
}
