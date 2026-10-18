import { router, useLocalSearchParams } from 'expo-router';
import { FileSearch, Plus, RefreshCw, Search, TriangleAlert } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DocumentCard } from '@/components/document-card';
import { DocumentFilters } from '@/components/document-filters';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { DocumentCardSkeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { useDocumentList } from '@/hooks/use-documents';
import { useIsWide } from '@/hooks/use-responsive';
import { errorMessage } from '@/lib/api/client';
import { canUpload, isManagement } from '@/lib/permissions';
import { useSession } from '@/lib/session/store';
import type { DocumentFilters as Filters } from '@/lib/types';
import { colors, layout, spacing } from '@/theme';

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function DocumentListScreen() {
  const role = useSession((s) => s.user?.role);
  const wide = useIsWide();
  const params = useLocalSearchParams<{ typeId?: string }>();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(() => ({
    typeId: params.typeId ? Number(params.typeId) : undefined,
  }));

  // Si se llega desde un contador del inicio, aplica el tipo recibido por parámetro.
  const [lastTypeParam, setLastTypeParam] = useState(params.typeId);
  if (params.typeId !== lastTypeParam) {
    setLastTypeParam(params.typeId);
    if (params.typeId) setFilters((f) => ({ ...f, typeId: Number(params.typeId) }));
  }

  const q = useDebounced(search.trim());
  const query = useMemo<Filters>(() => ({ ...filters, q: q || undefined }), [filters, q]);
  const list = useDocumentList(query);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <AppText variant="title" accessibilityRole="header">
            Documentos
          </AppText>
          <AppText variant="caption" testID="documents-count">
            {list.isLoading ? 'Cargando…' : `${total} ${total === 1 ? 'documento' : 'documentos'}`}
          </AppText>
        </View>
        {Platform.OS === 'web' && (
          <Button
            testID="documents-refresh"
            label="Actualizar"
            icon={RefreshCw}
            variant="ghost"
            compact
            onPress={() => void list.refetch()}
          />
        )}
        {canUpload(role) && (
          <Button testID="documents-upload" label="Subir" icon={Plus} compact onPress={() => router.navigate('/upload')} />
        )}
      </View>
      <TextField
        testID="documents-search"
        icon={Search}
        placeholder="Buscar por título, folio o descripción"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Buscar documentos"
      />
      <DocumentFilters value={filters} onChange={setFilters} showStatus={isManagement(role)} />
    </View>
  );

  const empty = list.isLoading ? (
    <View style={styles.gap}>
      <DocumentCardSkeleton />
      <DocumentCardSkeleton />
      <DocumentCardSkeleton />
    </View>
  ) : list.isError ? (
    <EmptyState
      testID="documents-error"
      icon={TriangleAlert}
      title="No pudimos cargar los documentos"
      message={errorMessage(list.error)}
      actionLabel="Reintentar"
      onAction={() => void list.refetch()}
    />
  ) : (
    <EmptyState
      testID="documents-empty"
      icon={FileSearch}
      title={q || Object.values(filters).some(Boolean) ? 'Sin resultados' : 'Aún no hay documentos'}
      message={
        q || Object.values(filters).some(Boolean)
          ? 'Prueba con otras palabras o quita algunos filtros.'
          : 'Cuando el colegio comparta documentos contigo, aparecerán aquí.'
      }
    />
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <FlatList
        testID="documents-list"
        data={items}
        keyExtractor={(d) => d.id}
        renderItem={({ item }) => <DocumentCard doc={item} onPress={() => router.push(`/documents/${item.id}`)} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          list.isFetchingNextPage ? <ActivityIndicator color={colors.secondaryStrong} style={styles.footer} /> : null
        }
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching && !list.isFetchingNextPage}
            onRefresh={() => void list.refetch()}
            tintColor={colors.secondaryStrong}
          />
        }
        contentContainerStyle={[styles.content, wide && styles.contentWide]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  contentWide: { padding: spacing.xl },
  header: { gap: spacing.md, marginBottom: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titleText: { flex: 1 },
  separator: { height: spacing.sm },
  gap: { gap: spacing.sm },
  footer: { marginVertical: spacing.lg },
});
