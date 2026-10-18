import { StyleSheet, View } from 'react-native';
import { colors, fonts, radius, spacing } from '@/theme';
import { AppText } from './app-text';
import type { DateFieldProps } from './date-field';

/** Web: input de fecha nativo del navegador (accesible y con calendario). */
export function DateField({ label, value, onChange, error, testID }: DateFieldProps) {
  return (
    <View style={styles.wrapper}>
      <AppText variant="label">{label}</AppText>
      <input
        type="date"
        data-testid={testID}
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        style={{
          minHeight: 50,
          padding: `0 ${spacing.md}px`,
          borderRadius: radius.md,
          border: `1.5px solid ${error ? colors.danger : colors.border}`,
          backgroundColor: colors.surface,
          color: colors.text,
          fontFamily: fonts.regular,
          fontSize: 15,
          boxSizing: 'border-box',
          width: '100%',
        }}
      />
      {error && (
        <AppText variant="caption" color="dangerStrong">
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs, flex: 1, minWidth: 150 },
});
