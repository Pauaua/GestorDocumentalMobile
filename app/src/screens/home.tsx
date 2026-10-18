import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { FileText, Inbox, UploadCloud, UsersRound, type LucideIcon } from 'lucide-react-native';
import { RefreshControl, Pressable, StyleSheet, View } from 'react-native';
import { DocumentCard } from '@/components/document-card';
import { DocumentTypeIcon } from '@/components/document-type-tag';
import { AppText } from '@/components/ui/app-text';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { DocumentCardSkeleton, Skeleton } from '@/components/ui/skeleton';
import { documentKeys, useDocumentStats } from '@/hooks/use-documents';
import { documentsApi } from '@/lib/api/endpoints';
import { firstName, greeting } from '@/lib/format';
import { canUpload, isAdmin, isManagement, ROLE_LABELS } from '@/lib/permissions';
import { useSession } from '@/lib/session/store';
import { colors, gradient, radius, shadows, spacing } from '@/theme';

function QuickAction({ icon: Icon, label, onPress, testID, tint }: { icon: LucideIcon; label: string; onPress: () => void; testID: string; tint: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <View style={[styles.actionIcon, { backgroundColor: tint }]}>
        <Icon size={22} color={colors.text} strokeWidth={1.6} />
      </View>
      <AppText variant="bodyStrong" style={styles.shrink}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function HomeScreen() {
  const user = useSession((s) => s.user)!;
  const management = isManagement(user.role);
  const stats = useDocumentStats();
  const latest = useQuery({
    queryKey: [...documentKeys.all, 'latest'],
    queryFn: () => documentsApi.list({}, 1, 5),
  });

  const refreshing = latest.isRefetching || stats.isRefetching;
  const refresh = () => {
    void latest.refetch();
    if (management) void stats.refetch();
  };

  return (
    <Screen
      testID="home-screen"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.secondaryStrong} />}
      header={
        <LinearGradient colors={[...gradient]} style={styles.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <AppText variant="caption" color="text">
            {user.school.name}
          </AppText>
          <AppText variant="display" testID="home-greeting" accessibilityRole="header">
            {greeting()}, {firstName(user.fullName)}
          </AppText>
          <View style={styles.roleBadge}>
            <AppText variant="caption" color="secondaryStrong" testID="home-role">
              {ROLE_LABELS[user.role]}
            </AppText>
          </View>
        </LinearGradient>
      }
    >
      <View style={styles.actions}>
        <QuickAction
          testID="home-action-documents"
          icon={FileText}
          label="Ver documentos"
          tint={colors.primarySoft}
          onPress={() => router.navigate('/documents')}
        />
        {canUpload(user.role) && (
          <QuickAction
            testID="home-action-upload"
            icon={UploadCloud}
            label="Subir documento"
            tint={colors.secondarySoft}
            onPress={() => router.navigate('/upload')}
          />
        )}
        {isAdmin(user.role) && (
          <QuickAction
            testID="home-action-users"
            icon={UsersRound}
            label="Usuarios"
            tint={colors.accentSoft}
            onPress={() => router.navigate('/users')}
          />
        )}
      </View>

      {management && (
        <View style={styles.section}>
          <AppText variant="subtitle">Documentos por tipo</AppText>
          <View style={styles.stats} testID="home-stats">
            {stats.isLoading
              ? Array.from({ length: 6 }, (_, i) => (
                  <View key={i} style={styles.stat}>
                    <Skeleton width={40} height={40} />
                    <Skeleton width="60%" height={14} />
                  </View>
                ))
              : stats.data?.byType.map((t) => (
                  <Pressable
                    key={t.id}
                    testID={`home-stat-${t.code}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.name}: ${t.count} documentos`}
                    onPress={() => router.navigate({ pathname: '/documents', params: { typeId: String(t.id) } })}
                    style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
                  >
                    <DocumentTypeIcon code={t.code} size={40} />
                    <View style={styles.shrink}>
                      <AppText variant="title">{t.count}</AppText>
                      <AppText variant="caption">{t.name}</AppText>
                    </View>
                  </Pressable>
                ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <AppText variant="subtitle">Últimos documentos</AppText>
        {latest.isLoading ? (
          <>
            <DocumentCardSkeleton />
            <DocumentCardSkeleton />
          </>
        ) : latest.data?.items.length ? (
          latest.data.items.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} onPress={() => router.navigate(`/documents/${doc.id}`)} />
          ))
        ) : (
          <EmptyState
            icon={Inbox}
            title="Aún no hay documentos para ti"
            message="Cuando el colegio comparta un documento contigo, aparecerá aquí."
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xxs },
  roleBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: {
    flexGrow: 1,
    flexBasis: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.soft,
  },
  actionIcon: { width: 42, height: 42, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  section: { gap: spacing.sm },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shrink: { flexShrink: 1 },
  pressed: { opacity: 0.8 },
});
