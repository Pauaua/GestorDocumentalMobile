import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import type * as NotificationsModule from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { notificationsApi } from '../api/endpoints';

/**
 * Push con Expo (app nativa). Requiere un development build y el projectId de EAS (`eas init`);
 * sin él la app funciona igual y los avisos llegan a la bandeja y por correo.
 */
const CHANNEL_ID = 'documentos';
let registeredToken: string | null = null;

/**
 * Expo Go no trae el push remoto en Android (SDK 53+) y el módulo falla al importarse, lo que tumba la carga de
 * las rutas. Se carga solo fuera de Expo Go; ahí los avisos siguen llegando a la bandeja y por correo.
 */
const Notifications: typeof NotificationsModule | null =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('expo-notifications');

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Pide permiso y registra el dispositivo en la API. Silencioso si no es posible (emulador, sin permiso). */
export async function registerForPush(): Promise<void> {
  const id = projectId();
  if (!Notifications || !Device.isDevice || !id) return;
  try {
    // En Android 13+ el canal debe existir antes de pedir el permiso.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Documentos del colegio',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await notificationsApi.registerPushToken(data, Platform.OS === 'ios' ? 'ios' : 'android');
    registeredToken = data;
  } catch {
    // Sin red o sin servicios de Google: se reintenta en el próximo inicio de sesión.
  }
}

/** Al cerrar sesión el dispositivo deja de recibir avisos de esa cuenta. */
export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  await notificationsApi.unregisterPushToken(token).catch(() => undefined);
}

function openFromResponse(response: NotificationsModule.NotificationResponse | null): void {
  const documentId = response?.notification.request.content.data?.documentId;
  if (typeof documentId === 'string') router.push(`/documents/${documentId}`);
}

/** Al tocar un aviso se abre el documento (también si la app estaba cerrada). Devuelve la limpieza. */
export function listenToPushTaps(): () => void {
  if (!Notifications) return () => undefined;
  void Notifications.getLastNotificationResponseAsync().then((r) => {
    openFromResponse(r);
    if (r) void Notifications?.clearLastNotificationResponseAsync();
  });
  const sub = Notifications.addNotificationResponseReceivedListener(openFromResponse);
  return () => sub.remove();
}
