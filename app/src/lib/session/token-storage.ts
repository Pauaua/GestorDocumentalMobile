import * as SecureStore from 'expo-secure-store';

/**
 * Móvil: el refresh token se guarda cifrado en el llavero (iOS Keychain / Android Keystore).
 * La versión web (token-storage.web.ts) no guarda nada: usa la cookie httpOnly del servidor.
 */
const KEY = 'gd_refresh_token';

export const usesRefreshCookie = false;

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
