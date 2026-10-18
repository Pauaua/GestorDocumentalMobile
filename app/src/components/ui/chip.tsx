import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';
import { colors, fonts, radius, spacing } from '@/theme';
import { AppText } from './app-text';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
  /** Colores del estado seleccionado (por defecto celeste). */
  selectedBackground?: string;
  selectedForeground?: string;
}

export function Chip({
  label,
  selected,
  onPress,
  testID,
  selectedBackground = colors.primarySoft,
  selectedForeground = colors.primaryStrong,
}: ChipProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: selectedBackground, borderColor: selectedBackground },
        pressed && styles.pressed,
      ]}
    >
      {selected && <Check size={14} color={selectedForeground} strokeWidth={2.25} />}
      <AppText style={[styles.label, { color: selected ? selectedForeground : colors.textSecondary }]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    minHeight: 36,
    maxWidth: '100%',
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.8 },
  label: { fontFamily: fonts.semibold, fontSize: 14, flexShrink: 1 },
});
