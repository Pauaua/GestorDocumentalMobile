import { Alert } from 'react-native';

/** Diálogo de confirmación nativo. */
export function confirm(title: string, message: string, confirmLabel = 'Confirmar'): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
