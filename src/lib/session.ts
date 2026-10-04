import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'manager-session';

/** The manager's sign-in token: the device keychain on phones, browser storage on the web. */
export const session = {
  async get(): Promise<string | null> {
    try {
      return Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) ?? null : await SecureStore.getItemAsync(KEY);
    } catch {
      return null;
    }
  },
  async set(token: string | null) {
    try {
      if (Platform.OS === 'web') {
        if (token) globalThis.localStorage?.setItem(KEY, token);
        else globalThis.localStorage?.removeItem(KEY);
      } else if (token) await SecureStore.setItemAsync(KEY, token);
      else await SecureStore.deleteItemAsync(KEY);
    } catch {
      // Storage unavailable (private mode): the manager signs in again next time.
    }
  },
};
