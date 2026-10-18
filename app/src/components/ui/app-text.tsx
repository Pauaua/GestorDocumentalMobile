import { StyleSheet, Text, type TextProps } from 'react-native';
import { colors, layout, typography, type ColorToken, type TypographyVariant } from '@/theme';

interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: ColorToken;
  align?: 'left' | 'center' | 'right';
}

export function AppText({ variant = 'body', color, align, style, ...props }: AppTextProps) {
  return (
    <Text
      maxFontSizeMultiplier={layout.maxFontScale}
      {...props}
      style={[typography[variant], color && { color: colors[color] }, align && { textAlign: align }, style]}
    />
  );
}

export const textStyles = StyleSheet.create({
  truncate: { flexShrink: 1 },
});
