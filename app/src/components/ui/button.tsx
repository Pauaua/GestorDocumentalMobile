import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fonts, radius, spacing } from '@/theme';
import { AppText } from './app-text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  compact?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const variants: Record<Variant, { bg: string; bgPressed: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, bgPressed: colors.accent, fg: colors.text },
  secondary: { bg: colors.secondarySoft, bgPressed: colors.secondary, fg: colors.secondaryStrong },
  ghost: { bg: colors.surface, bgPressed: colors.primarySoft, fg: colors.text, border: colors.border },
  danger: { bg: colors.dangerSoft, bgPressed: colors.danger, fg: colors.dangerStrong },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon: Icon,
  loading,
  disabled,
  fullWidth,
  compact,
  testID,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const v = variants[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        { backgroundColor: pressed ? v.bgPressed : v.bg },
        v.border && { borderWidth: 1, borderColor: v.border },
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={v.fg} />
        ) : (
          Icon && <Icon size={18} color={v.fg} strokeWidth={1.75} />
        )}
        <AppText style={[styles.label, { color: v.fg }]}>{label}</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compact: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  fullWidth: { alignSelf: 'stretch' },
  disabled: { opacity: 0.55 },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { fontFamily: fonts.bold, fontSize: 15 },
});
