import { router } from 'expo-router';
import { Bell, BellOff, CheckCheck, TriangleAlert } from 'lucide-react-native';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/hooks/use-notifications';
import { errorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import type { AppNotification } from '@/lib/types';
import { colors, radius, spacing } from '@/theme';

function NotificationRow({ item, onOpen }: { item: AppNotification; onOpen: () => void }) {
  const unread = !item.readAt;
  return (
    <Pressable
      testID={`notification-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'No leída. ' : ''}${item.title}: ${item.body}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && styles.pressed]}
    >
      <View style={[styles.dot, unread && styles.dotUnread]} />
      <View style={styles.flex}>
        <AppText variant={unread ? 'bodyStrong' : 'body'}>{item.title}</AppText>
        <AppText variant="body" color="textSecondary" numberOfLines={2}>
          {item.body}
        </AppText>
        <AppText variant="caption">{formatDateTime(item.createdAt)}</AppText>
      </View>
    </Pressable>
  );
}

export function NotificationsScreen() {
  const { data, isLoading, error, refetch, isRefetching } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const open = (item: AppNotification) => {
    if (!item.readAt) markRead.mutate(item.id);
    if (item.documentId) router.push(`/documents/${item.documentId}`);
  };

  return (
    <Screen
      testID="notifications-screen"
      title="Avisos"
      subtitle={data ? (data.unread > 0 ? `${data.unread} sin leer` : 'Estás al día') : undefined}
      headerRight={
        data && data.unread > 0 ? (
          <Button
            testID="notifications-read-all"
            label="Marcar todo como leído"
            icon={CheckCheck}
            variant="ghost"
            compact
            loading={markAll.isPending}
            onPress={() => markAll.mutate()}
          />
        ) : undefined
      }
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.secondaryStrong} />}
    >
      {isLoading ? (
        <View style={styles.list}>
          <Skeleton height={72} rounded={radius.lg} />
          <Skeleton height={72} rounded={radius.lg} />
        </View>
      ) : error ? (
        <EmptyState
          icon={TriangleAlert}
          title="No pudimos cargar tus avisos"
          message={errorMessage(error)}
          actionLabel="Reintentar"
          onAction={() => void refetch()}
        />
      ) : !data?.items.length ? (
        <EmptyState
          testID="notifications-empty"
          icon={BellOff}
          title="Sin avisos por ahora"
          message="Cuando el colegio publique un documento para ti, aparecerá aquí."
        />
      ) : (
        <View style={styles.list}>
          {data.items.map((item) => (
            <NotificationRow key={item.id} item={item} onOpen={() => open(item)} />
          ))}
          {data.hasMore && (
            <View style={styles.more}>
              <Bell size={14} color={colors.textMuted} strokeWidth={1.75} />
              <AppText variant="caption" style={styles.shrink}>Se muestran los {data.items.length} avisos más recientes.</AppText>
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  shrink: { flexShrink: 1 },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowUnread: { borderColor: colors.secondary, backgroundColor: colors.secondarySoft },
  pressed: { opacity: 0.7 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: 'transparent' },
  dotUnread: { backgroundColor: colors.secondaryStrong },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, padding: spacing.sm },
});
