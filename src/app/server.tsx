import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { serverUrl } from '@/api';
import { QrScanner } from '@/ui/qr-scanner';
import { Button, Card, ErrorText, Field, H2, Hint, Screen } from '@/ui/kit';

/** Where the phone app finds the server: the built-in address or another one, e.g. a computer in the office Wi-Fi. */
export default function ServerAddress() {
  // ?scan=1 from the home screen opens the camera at once.
  const { scan: scanParam } = useLocalSearchParams<{ scan?: string }>();
  const [url, setUrl] = useState(serverUrl.missing() ? '' : serverUrl.get());
  const [scan, setScan] = useState(scanParam === '1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setScan(scanParam === '1'), [scanParam]);

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
        <Hint>Приложение работает с сервером «Сделки онлайн».</Hint>
        <Hint>Если сервер запущен на компьютере (start.bat или start.command), телефон должен быть в той же сети Wi-Fi. В окне сервера и в разделе «Подключить телефон» есть QR-код с адресом.</Hint>
        {scan
          ? <QrScanner onClose={() => setScan(false)} onAddress={(u) => { setScan(false); setUrl(u); apply(u); }} />
          : <Button title="Подключить по QR-коду" onPress={() => setScan(true)} disabled={busy} />}
        <Field label="Или впишите адрес" value={url} onChangeText={setUrl} placeholder="http://192.168.1.10:3000"
          autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Button ghost title="Проверить и сохранить" onPress={() => apply(url)} loading={busy} disabled={!url.trim()} />
        {!!error && <ErrorText>{error}</ErrorText>}
        {!serverUrl.missing() && serverUrl.get() !== serverUrl.builtIn && (
          <Button ghost title="Вернуть встроенный адрес" onPress={() => apply(null)} disabled={busy} />
        )}
      </Card>
    </Screen>
  );
}
