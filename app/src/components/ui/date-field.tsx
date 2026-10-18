import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { formatDate } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './app-text';

export interface DateFieldProps {
  label: string;
  value: string | undefined;
  onChange: (isoDate: string | undefined) => void;
  error?: string;
  testID?: string;
  placeholder?: string;
  clearable?: boolean;
}

const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1);
};

/** Móvil: selector de fecha nativo. La versión web usa <input type="date">. */
export function DateField({ label, value, onChange, error, testID, placeholder = 'Elegir fecha', clearable }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const handle = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'set' && date) onChange(toIso(date));
    if (event.type === 'dismissed') setOpen(false);
  };
  return (
    <View style={styles.wrapper}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatDate(value) : 'sin fecha'}`}
        onPress={() => setOpen((o) => !o)}
        style={[styles.field, !!error && styles.errored]}
      >
        <CalendarDays size={18} color={colors.textMuted} strokeWidth={1.75} />
        <AppText style={styles.value} color={value ? 'text' : 'textMuted'}>
          {value ? formatDate(value) : placeholder}
        </AppText>
        {clearable && value && (
          <Pressable accessibilityLabel={`Limpiar ${label}`} hitSlop={8} onPress={() => onChange(undefined)}>
            <AppText variant="caption">Limpiar</AppText>
          </Pressable>
        )}
      </Pressable>
      {open && (
        <DateTimePicker
          value={value ? fromIso(value) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          locale="es-CL"
          onChange={handle}
        />
      )}
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
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  errored: { borderColor: colors.danger },
  value: { flex: 1 },
});
