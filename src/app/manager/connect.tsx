import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { managerApi } from '@/api';
import { Button, Card, H2, Hint, Loading, Screen, Txt } from '@/ui/kit';

/** Android app from the latest build on GitHub; set EXPO_PUBLIC_ANDROID_APK_URL when it is published elsewhere. */
const APK_URL = process.env.EXPO_PUBLIC_ANDROID_APK_URL || 'https://github.com/ivan20200828-a11y/-/releases/download/android-test/sdelka-online.apk';

/** How a phone gets the app and connects to this server: the app's download and QR codes with the server's address. */
export default function ConnectPhone() {
  const [urls, setUrls] = useState<{ url: string; qr: string }[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    managerApi.connect().then(setUrls, (e) => setError((e as Error).message));
  }, []);

  if (!urls) return <Loading error={error} />;
  return (
    <Screen>
      <Card>
        <H2>1. Установите приложение</H2>
        <Hint>Android: скачайте файл на телефоне и откройте его. Телефон попросит разрешить установку из этого источника.</Hint>
        <Button ghost title="Скачать приложение для Android" onPress={() => Linking.openURL(APK_URL).catch(() => {})} />
        <Hint>iPhone: наведите обычную камеру на QR-код ниже, откройте ссылку в Safari и выберите «Поделиться» → «На экран Домой».</Hint>
      </Card>
      <Card>
        <H2>2. Подключите к серверу</H2>
        {urls.length === 0 ? (
          <Hint>Компьютер не подключён к сети Wi-Fi или кабелем: телефону не к чему подключиться.</Hint>
        ) : (
          <>
            <Hint>В приложении нажмите «Подключить по QR-коду» и наведите камеру на код. Телефон должен быть в той же сети, что и этот компьютер.</Hint>
            {urls.map(({ url, qr }, i) => (
              <View key={url} style={{ alignItems: 'center', gap: 8 }}>
                <Image source={{ uri: `data:image/svg+xml;utf8,${encodeURIComponent(qr)}` }} style={{ width: 220, height: 220 }}
                  accessibilityLabel={`QR-код адреса ${url}`} />
                <Txt selectable>{url}</Txt>
                {i === 0 && urls.length > 1 && <Hint>Если этот адрес не открывается, попробуйте следующий.</Hint>}
              </View>
            ))}
          </>
        )}
      </Card>
    </Screen>
  );
}
