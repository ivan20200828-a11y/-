import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** A small secret kept on the device: the keychain on phones, browser storage on the web. */
function stored(key: string) {
  return {
    async get(): Promise<string | null> {
      try {
        return Platform.OS === 'web' ? globalThis.localStorage?.getItem(key) ?? null : await SecureStore.getItemAsync(key);
      } catch {
        return null;
      }
    },
    async set(value: string | null) {
      try {
        if (Platform.OS === 'web') {
          if (value) globalThis.localStorage?.setItem(key, value);
          else globalThis.localStorage?.removeItem(key);
        } else if (value) await SecureStore.setItemAsync(key, value);
        else await SecureStore.deleteItemAsync(key);
      } catch {
        // Storage unavailable (private mode): asked again next time.
      }
    },
  };
}

/** The manager's sign-in token. */
export const session = stored('manager-session');

/** The client's deal token from the invitation, so a refresh or the bank's return opens the same deal. */
export const clientDealToken = stored('client-deal');
