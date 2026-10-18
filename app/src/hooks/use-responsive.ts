import { Platform, useWindowDimensions } from 'react-native';
import { layout } from '@/theme';

/** En web ancha la navegación pasa de tabs inferiores a barra lateral. */
export function useIsWide(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= layout.wideBreakpoint;
}
