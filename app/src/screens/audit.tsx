import { useInfiniteQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { History, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { BackButton } from '@/components/back-button';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api/client';
import { auditApi } from '@/lib/api/endpoints';
import { formatDateTime } from '@/lib/format';
import { isAdmin } from '@/lib/permissions';
import { useSession } from '@/lib/session/store';
import type { AuditEvent } from '@/lib/types';
import { colors, radius, spacing } from '@/theme';

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Inició sesión',
  'auth.login_failed': 'Intento de inicio de sesión fallido',
  'auth.password_reset_requested': 'Pidió recuperar su contraseña',
  'auth.password_reset': 'Cambió su contraseña con un enlace',
  'auth.invitation_accepted': 'Activó su cuenta',
  'document.created': 'Publicó un documento',
  'document.updated': 'Editó un documento',
  'document.deleted': 'Eliminó un documento',
  'document.acknowledged': 'Confirmó la recepción de un documento',
  'user.created': 'Creó una cuenta',
  'user.added_to_school': 'Agregó una cuenta existente al colegio',
  'user.updated': 'Modificó un usuario',
  'import.people': 'Importó personas',
  'import.students': 'Importó estudiantes',
  'data.exported': 'Descargó sus datos personales',
  'platform.school_created': 'RTLCO dio de alta el colegio',
  'platform.school_updated': 'RTLCO modificó el colegio',
};

const FILTERS = [
  { key: undefined, label: 'Todo' },
  { key: 'auth', label: 'Accesos' },
  { key: 'document', label: 'Documentos' },
  { key: 'user', label: 'Usuarios' },
  { key: 'import', label: 'Importaciones' },
] as const;

/** Detalle breve y legible del evento (sin volcar el JSON completo). */
function detail(e: AuditEvent): string | null {
  const m = (e.metadata ?? {}) as Record<string, unknown>;
  if (typeof m.title === 'string') return `"${m.title}"`;
  if (typeof m.email === 'string') return m.email;
  if (Array.isArray(m.fields)) return `Cambios: ${(m.fields as string[]).join(', ')}`;
  if (typeof m.valid === 'number') return `${m.valid} filas válidas`;
  return null;
}

function EventRow({ event }: { event: AuditEvent }) {
  const extra = detail(event);
  return (
    <View style={styles.row} testID={`audit-${event.id}`}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{ACTION_LABELS[event.action] ?? event.action}</AppText>
        <AppText variant="caption">
          {event.actor?.fullName ?? (event.actor ? 'Cuenta eliminada' : 'Sin sesión')}
          {extra ? ` · ${extra}` : ''}
          {event.ip ? ` · IP ${event.ip}` : ''}
        </AppText>
      </View>
      <AppText variant="caption">{formatDateTime(event.createdAt)}</AppText>
    </View>
  );
}

export function AuditScreen() {
  const role = useSession((s) => s.user?.role);
  const [action, setAction] = useState<string | undefined>();
  const query = useInfiniteQuery({
    queryKey: ['audit', action],
    queryFn: ({ pageParam }) => auditApi.list({ action, page: pageParam, pageSize: 50 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: isAdmin(role),
  });

  if (!isAdmin(role)) return <Redirect href="/" />;
  const events = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen
      testID="audit-screen"
      title="Bitácora"
      subtitle="Quién hizo qué, cuándo y desde dónde"
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.secondaryStrong} />}
    >
      <BackButton />
      <View style={styles.chips}>
        {FILTERS.map((f) => (
          <Chip key={f.label} testID={`audit-filter-${f.key ?? 'all'}`} label={f.label} selected={action === f.key} onPress={() => setAction(f.key)} />
        ))}
      </View>
      {query.isLoading ? (
        <Skeleton height={160} rounded={radius.lg} />
      ) : query.error ? (
        <EmptyState icon={TriangleAlert} title="No pudimos cargar la bitácora" message={errorMessage(query.error)} actionLabel="Reintentar" onAction={() => void query.refetch()} />
      ) : events.length === 0 ? (
        <EmptyState icon={History} title="Sin eventos" message="Aún no hay actividad registrada con este filtro." />
      ) : (
        <Card>
          {events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
          {query.hasNextPage && (
            <Button
              label="Ver más"
              variant="ghost"
              compact
              loading={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
            />
          )}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
