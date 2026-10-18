import { queryClient } from '../query-client';
import { authApi } from '../api/endpoints';
import { refreshSession } from '../api/client';
import { registerForPush, unregisterPush } from '../notifications/push';
import { initSchool, schoolUrl, useSchool } from '../school/store';
import { useSession } from './store';
import { clearRefreshToken, getRefreshToken, setRefreshToken } from './token-storage';

/** Al abrir la app intenta recuperar la sesión con el refresh token (cookie en web, SecureStore en móvil). */
export async function restoreSession(): Promise<void> {
  await initSchool();
  // Sin colegio elegido no hay sesión que recuperar: el login pide el código.
  if (!useSchool.getState().slug) {
    useSession.getState().clear();
    return;
  }
  try {
    const token = await refreshSession();
    if (!token) useSession.getState().clear();
    else void registerForPush();
  } catch {
    useSession.getState().clear();
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const session = await authApi.login(email, password);
  if (session.refreshToken) await setRefreshToken(session.refreshToken);
  queryClient.clear();
  useSession.getState().setSession(session.user, session.accessToken);
  void registerForPush();
}

export async function signOut(): Promise<void> {
  await unregisterPush();
  try {
    await authApi.logout(await getRefreshToken());
  } catch {
    // Aunque falle la red, la sesión local se cierra igual.
  }
  await clearRefreshToken();
  queryClient.clear();
  useSession.getState().clear();
}

/** Entra a otro colegio: en la web con dominio propio va a su subdominio; si no, cierra sesión y lo deja elegido. */
export async function switchSchool(slug: string): Promise<void> {
  const url = schoolUrl(slug);
  if (url) {
    window.location.assign(url);
    return;
  }
  await signOut();
  await useSchool.getState().setSlug(slug);
}
