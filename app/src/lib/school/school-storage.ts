import * as SecureStore from 'expo-secure-store';

/** Móvil: el colegio elegido se recuerda entre aperturas de la app. */
const KEY = 'rtlco_school';

export async function getStoredSchool(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function setStoredSchool(slug: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, slug);
}

export async function clearStoredSchool(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
