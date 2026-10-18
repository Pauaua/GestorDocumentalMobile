import { SlidersHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useDocumentTypes } from '@/hooks/use-documents';
import type { DocumentFilters as Filters } from '@/lib/types';
import { colors, documentTypeStyle, radius, spacing } from '@/theme';
import { AppText } from './ui/app-text';
import { Chip } from './ui/chip';
import { DateField } from './ui/date-field';

interface DocumentFiltersProps {
  value: Filters;
  onChange: (next: Filters) => void;
  showStatus: boolean;
}

export function DocumentFilters({ value, onChange, showStatus }: DocumentFiltersProps) {
  const { data: types = [] } = useDocumentTypes();
  const [expanded, setExpanded] = useState(false);
  const activeCount = [value.dateFrom, value.dateTo, value.status].filter(Boolean).length;

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip
          testID="filter-type-all"
          label="Todos"
          selected={!value.typeId}
          onPress={() => onChange({ ...value, typeId: undefined })}
        />
        {types.map((t) => {
          const s = documentTypeStyle(t.code);
          return (
            <Chip
              key={t.id}
              testID={`filter-type-${t.code}`}
              label={t.name}
              selected={value.typeId === t.id}
              selectedBackground={s.background}
              selectedForeground={s.foreground}
              onPress={() => onChange({ ...value, typeId: value.typeId === t.id ? undefined : t.id })}
            />
          );
        })}
      </ScrollView>

      <Pressable
        testID="filters-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel="Más filtros"
        onPress={() => setExpanded((e) => !e)}
        style={styles.toggle}
      >
        <SlidersHorizontal size={16} color={colors.secondaryStrong} strokeWidth={1.75} />
        <AppText variant="caption" color="secondaryStrong">
          Más filtros{activeCount ? ` (${activeCount})` : ''}
        </AppText>
      </Pressable>

      {expanded && (
        <View style={styles.panel}>
          <View style={styles.dates}>
            <DateField
              label="Desde"
              testID="filter-date-from"
              value={value.dateFrom}
              clearable
              onChange={(dateFrom) => onChange({ ...value, dateFrom })}
            />
            <DateField
              label="Hasta"
              testID="filter-date-to"
              value={value.dateTo}
              clearable
              onChange={(dateTo) => onChange({ ...value, dateTo })}
            />
          </View>
          {showStatus && (
            <View style={styles.statusRow}>
              <AppText variant="label">Estado</AppText>
              <View style={styles.chipsWrap}>
                {(['VIGENTE', 'ARCHIVADO'] as const).map((status) => (
                  <Chip
                    key={status}
                    testID={`filter-status-${status}`}
                    label={status === 'VIGENTE' ? 'Vigente' : 'Archivado'}
                    selected={value.status === status}
                    onPress={() => onChange({ ...value, status: value.status === status ? undefined : status })}
                  />
                ))}
              </View>
            </View>
          )}
          {activeCount > 0 && (
            <Pressable
              testID="filters-clear"
              accessibilityRole="button"
              onPress={() => onChange({ q: value.q, typeId: value.typeId })}
            >
              <AppText variant="caption" color="primaryStrong">
                Limpiar filtros
              </AppText>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  chips: { gap: spacing.xs, paddingVertical: 2 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, alignSelf: 'flex-start', paddingVertical: 4 },
  panel: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusRow: { gap: spacing.xs },
});
