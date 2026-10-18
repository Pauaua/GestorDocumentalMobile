import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/lib/api/endpoints';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: ['notifications', 'list'] as const,
  preferences: ['notifications', 'preferences'] as const,
};

/** Bandeja del colegio actual. Se refresca cada minuto para mantener el contador de no leídos. */
export function useNotifications() {
  return useQuery({ queryKey: notificationKeys.list, queryFn: () => notificationsApi.list(), refetchInterval: 60_000 });
}

export function useUnreadCount(): number {
  return useNotifications().data?.unread ?? 0;
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.read(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.list }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.readAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.list }),
  });
}

export function useNotificationPreferences() {
  return useQuery({ queryKey: notificationKeys.preferences, queryFn: notificationsApi.preferences });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.updatePreferences,
    onSuccess: (prefs) => qc.setQueryData(notificationKeys.preferences, prefs),
  });
}
