import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import { serverUrl } from '@/api';

import { ClientProvider } from '@/state/deals';

export default function RootLayout() {
  const scheme = useColorScheme();
  // On a phone the server address may have been changed in the app; read it before the first request.
  const [ready, setReady] = useState(!serverUrl.canChange);
  useEffect(() => {
    if (!ready) serverUrl.load().finally(() => setReady(true));
  }, [ready]);
  if (!ready) return null;
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <ClientProvider>
        <Stack screenOptions={{ headerBackTitle: 'Назад' }}>
          <Stack.Screen name="index" options={{ title: 'Сделка онлайн' }} />
          <Stack.Screen name="server" options={{ title: 'Адрес сервера' }} />
          <Stack.Screen name="client/index" options={{ title: 'Ваша сделка' }} />
          <Stack.Screen name="client/phone" options={{ title: 'Телефон' }} />
          <Stack.Screen name="client/documents" options={{ title: 'Документы' }} />
          <Stack.Screen name="client/contract" options={{ title: 'Договор' }} />
          <Stack.Screen name="client/sign" options={{ title: 'Подписание' }} />
          <Stack.Screen name="client/pay" options={{ title: 'Оплата взноса' }} />
          <Stack.Screen name="client/cabinet" options={{ title: 'Личный кабинет', headerBackVisible: false, headerLeft: () => null }} />
          <Stack.Screen name="manager/login" options={{ title: 'Вход для менеджера' }} />
          <Stack.Screen name="manager/index" options={{ title: 'Сделки' }} />
          <Stack.Screen name="manager/new" options={{ title: 'Новая сделка' }} />
          <Stack.Screen name="manager/[id]" options={{ title: 'Сделка' }} />
          <Stack.Screen name="manager/edit/[id]" options={{ title: 'Изменить сделку' }} />
          <Stack.Screen name="manager/team" options={{ title: 'Сотрудники' }} />
          <Stack.Screen name="manager/company" options={{ title: 'Компания' }} />
          <Stack.Screen name="manager/password" options={{ title: 'Пароль' }} />
        </Stack>
      </ClientProvider>
    </ThemeProvider>
  );
}
