/**
 * Paleta pastel entre celeste y morado.
 * Regla de contraste (WCAG AA): los pasteles se usan como fondos y superficies;
 * el texto siempre va en `text`, `textSecondary` o en los tonos "Strong" oscuros.
 */
export const colors = {
  background: '#F7F8FE',
  surface: '#FFFFFF',
  primary: '#A8C8F0', // celeste pastel
  primarySoft: '#DCEBFB',
  secondary: '#C3B1E8', // lavanda pastel
  secondarySoft: '#ECE5F8',
  accent: '#B5B8F0', // periwinkle
  accentSoft: '#E6E7FB',
  text: '#3E3B5C', // 10.6:1 sobre blanco
  textMuted: '#8A87A8', // solo placeholders, íconos y textos grandes (3.4:1)
  textSecondary: '#625F80', // texto secundario pequeño (6.1:1 sobre blanco)
  border: '#E4E1F2',
  success: '#B8E3D0',
  warning: '#F6E0B5',
  danger: '#F2C1CC',
  dangerSoft: '#FBE7EC',

  // Tonos oscuros para texto o íconos sobre los pasteles (todos ≥ 4.5:1).
  primaryStrong: '#2F5E99',
  secondaryStrong: '#5B4494',
  successStrong: '#245B43',
  warningStrong: '#7A5A14',
  dangerStrong: '#8C2F45',

  overlay: 'rgba(62, 59, 92, 0.35)',
  white: '#FFFFFF',
} as const;

export const gradient = ['#CFE3F9', '#DCD3F5'] as const;

export type ColorToken = keyof typeof colors;
