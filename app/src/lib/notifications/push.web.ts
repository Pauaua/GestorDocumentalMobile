/** Web: sin push (los avisos llegan a la bandeja y por correo). */
export async function registerForPush(): Promise<void> {}

export async function unregisterPush(): Promise<void> {}

export function listenToPushTaps(): () => void {
  return () => undefined;
}
