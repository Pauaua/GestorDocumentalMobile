import { Search, UserRoundCheck, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useUsers } from '@/hooks/use-users';
import { AUDIENCE_ROLES, ROLE_LABELS } from '@/lib/permissions';
import type { Role, UserSummary } from '@/lib/types';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './ui/app-text';
import { Chip } from './ui/chip';
import { Skeleton } from './ui/skeleton';
import { TextField } from './ui/text-field';

interface AudiencePickerProps {
  visibleRoles: Role[];
  onChangeRoles: (roles: Role[]) => void;
  recipients: UserSummary[];
  onChangeRecipients: (users: UserSummary[]) => void;
}

/**
 * Visibilidad del documento: el equipo directivo siempre lo ve; además se eligen
 * roles completos (docentes, apoderados) y/o destinatarios específicos.
 */
export function AudiencePicker({ visibleRoles, onChangeRoles, recipients, onChangeRecipients }: AudiencePickerProps) {
  const [query, setQuery] = useState('');
  const search = query.trim();
  const { data, isFetching } = useUsers({ q: search, isActive: 'true', pageSize: 8 }, search.length >= 2);
  const selectedIds = new Set(recipients.map((r) => r.id));

  const toggleRole = (role: Role) =>
    onChangeRoles(visibleRoles.includes(role) ? visibleRoles.filter((r) => r !== role) : [...visibleRoles, role]);

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <AppText variant="label">¿Quién puede verlo?</AppText>
        <AppText variant="caption">El equipo directivo siempre tiene acceso.</AppText>
        <View style={styles.chips}>
          {AUDIENCE_ROLES.map((role) => (
            <Chip
              key={role}
              testID={`visibility-role-${role}`}
              label={role === 'docente' ? 'Todos los docentes' : 'Todos los apoderados'}
              selected={visibleRoles.includes(role)}
              onPress={() => toggleRole(role)}
              selectedBackground={colors.secondarySoft}
              selectedForeground={colors.secondaryStrong}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="label">Destinatarios específicos (opcional)</AppText>
        <AppText variant="caption">Por ejemplo, una citación dirigida a un apoderado.</AppText>
        {recipients.length > 0 && (
          <View style={styles.chips}>
            {recipients.map((r) => (
              <Pressable
                key={r.id}
                testID={`recipient-selected-${r.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Quitar a ${r.fullName}`}
                onPress={() => onChangeRecipients(recipients.filter((x) => x.id !== r.id))}
                style={styles.selected}
              >
                <AppText variant="caption" color="primaryStrong" style={styles.shrink}>
                  {r.fullName} · {ROLE_LABELS[r.role]}
                </AppText>
                <X size={14} color={colors.primaryStrong} strokeWidth={2} />
              </Pressable>
            ))}
          </View>
        )}
        <TextField
          testID="recipient-search"
          icon={Search}
          placeholder="Buscar por nombre, RUT, correo o estudiante"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          accessibilityLabel="Buscar destinatarios"
        />
        {search.length >= 2 && (
          <View style={styles.results}>
            {isFetching && !data ? (
              <Skeleton height={40} />
            ) : data?.items.length ? (
              data.items.map((u) => {
                const selected = selectedIds.has(u.id);
                return (
                  <Pressable
                    key={u.id}
                    testID={`recipient-option-${u.email}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${u.fullName}, ${ROLE_LABELS[u.role]}`}
                    onPress={() =>
                      onChangeRecipients(
                        selected
                          ? recipients.filter((r) => r.id !== u.id)
                          : [...recipients, { id: u.id, fullName: u.fullName, role: u.role }],
                      )
                    }
                    style={({ pressed }) => [styles.option, (pressed || selected) && styles.optionActive]}
                  >
                    <View style={styles.optionText}>
                      <AppText variant="bodyStrong">{u.fullName}</AppText>
                      <AppText variant="caption">
                        {ROLE_LABELS[u.role]}
                        {u.students?.length ? ` · ${u.students.map((s) => `${s.fullName} (${s.course})`).join(', ')}` : ''}
                      </AppText>
                    </View>
                    {selected && <UserRoundCheck size={18} color={colors.primaryStrong} strokeWidth={1.75} />}
                  </Pressable>
                );
              })
            ) : (
              <AppText variant="caption" style={styles.noResults}>
                No encontramos personas con “{search}”.
              </AppText>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  section: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xxs },
  shrink: { flexShrink: 1 },
  selected: {
    flexDirection: 'row',
    maxWidth: '100%',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  results: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionActive: { backgroundColor: colors.primarySoft },
  optionText: { flex: 1, gap: 2 },
  noResults: { padding: spacing.md },
});
