import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { colors } from './colors';

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 40,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  pill: 999,
} as const;

export const fonts = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
} as const;

export const typography = {
  display: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 36, color: colors.text },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 30, color: colors.text },
  subtitle: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 24, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: colors.text },
  caption: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  label: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: colors.text, letterSpacing: 0.2 },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

/** Sombras muy suaves con tinte lavanda. */
export const shadows = {
  soft: Platform.select<ViewStyle>({
    web: { boxShadow: '0 4px 18px rgba(120, 110, 180, 0.10)' } as ViewStyle,
    default: {
      shadowColor: '#7A6FB4',
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
  }),
  raised: Platform.select<ViewStyle>({
    web: { boxShadow: '0 8px 28px rgba(120, 110, 180, 0.16)' } as ViewStyle,
    default: {
      shadowColor: '#7A6FB4',
      shadowOpacity: 0.16,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
  }),
} as const;

export const layout = {
  /** Ancho desde el que la web muestra barra lateral en vez de tabs inferiores. */
  wideBreakpoint: 900,
  /** Ancho bajo el que un teléfono se considera angosto. */
  compactBreakpoint: 380,
  /**
   * Tope de agrandamiento del texto con la letra grande del sistema: se respeta la preferencia,
   * pero sin que botones y filas se desarmen.
   */
  maxFontScale: 1.3,
  maxContentWidth: 1080,
  sidebarWidth: 248,
} as const;
