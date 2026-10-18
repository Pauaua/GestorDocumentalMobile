/** Web: Alert.alert con botones no existe en react-native-web; se usa window.confirm. */
export function confirm(title: string, message: string, _confirmLabel = 'Confirmar'): Promise<boolean> {
  return Promise.resolve(window.confirm(`${title}\n\n${message}`));
}
