import { AxiosError } from 'axios';
import { router } from 'expo-router';
import { Download, Lock, Pencil, Share2, Trash2, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { BackButton } from '@/components/back-button';
import { DocumentPreview } from '@/components/document-preview';
import { AcknowledgeCard, ReceiptsReport } from '@/components/document-receipts';
import { DocumentTypeTag } from '@/components/document-type-tag';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useDeleteDocument, useDocument, useDocumentDownloads } from '@/hooks/use-documents';
import { errorMessage } from '@/lib/api/client';
import { documentsApi } from '@/lib/api/endpoints';
import { confirm } from '@/lib/confirm';
import { saveDownloadedFile, shareDocumentFile } from '@/lib/files/file-actions';
import { formatBytes, formatDate, formatDateTime } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/permissions';
import type { DocumentItem } from '@/lib/types';
import { colors, radius, spacing } from '@/theme';

function MetaRow({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.metaRow}>
      <AppText variant="caption">{label}</AppText>
      <AppText variant="bodyStrong" testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

function DownloadsLog({ doc }: { doc: DocumentItem }) {
  const logs = useDocumentDownloads(doc.id, doc.permissions.canViewDownloads);
  return (
    <Card testID="document-downloads">
      <AppText variant="subtitle">Registro de descargas</AppText>
      {logs.isLoading ? (
        <Skeleton height={40} />
      ) : logs.data?.length ? (
        logs.data.map((log) => (
          <View key={log.id} style={styles.logRow}>
            <View style={styles.logPerson}>
              <AppText variant="bodyStrong">{log.user.fullName}</AppText>
              <AppText variant="caption">
                {ROLE_LABELS[log.user.role]}
                {log.ip ? ` · IP ${log.ip}` : ''}
              </AppText>
            </View>
            <AppText variant="caption">{formatDateTime(log.downloadedAt)}</AppText>
          </View>
        ))
      ) : (
        <AppText variant="caption" style={styles.logEmpty}>
          Nadie ha descargado este documento todavía.
        </AppText>
      )}
    </Card>
  );
}

export function DocumentDetailScreen({ id }: { id: string }) {
  const { data: doc, isLoading, error, refetch, isRefetching } = useDocument(id);
  const remove = useDeleteDocument();
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);

  const status = error instanceof AxiosError ? error.response?.status : undefined;

  if (isLoading) {
    return (
      <Screen>
        <BackButton />
        <Skeleton height={28} width="70%" />
        <Skeleton height={180} rounded={radius.lg} />
        <Skeleton height={120} rounded={radius.lg} />
      </Screen>
    );
  }

  if (!doc) {
    return (
      <Screen testID="document-detail">
        <BackButton />
        {status === 403 ? (
          <EmptyState
            testID="document-forbidden"
            icon={Lock}
            title="No tienes acceso a este documento"
            message="Este documento no está disponible para tu perfil. Si crees que es un error, contacta a la dirección."
          />
        ) : (
          <EmptyState
            testID="document-not-found"
            icon={TriangleAlert}
            title={status === 404 ? 'Documento no encontrado' : 'No pudimos cargar el documento'}
            message={status === 404 ? 'Puede que haya sido eliminado.' : errorMessage(error)}
            actionLabel="Reintentar"
            onAction={() => void refetch()}
          />
        )}
      </Screen>
    );
  }

  const withFile = async (kind: 'download' | 'share') => {
    setBusy(kind);
    try {
      const { url, fileName, mimeType } = await documentsApi.downloadUrl(doc.id, 'attachment');
      if (kind === 'download') {
        await saveDownloadedFile(url, fileName, mimeType);
        toast.success('Descarga iniciada');
      } else {
        const outcome = await shareDocumentFile(url, fileName, mimeType);
        if (outcome === 'copied') toast.info('Enlace temporal copiado (válido por 5 minutos)');
        if (outcome === 'unavailable') toast.error('Compartir no está disponible en este dispositivo');
      }
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo obtener el archivo'));
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async () => {
    const ok = await confirm('Eliminar documento', `¿Seguro que quieres eliminar “${doc.title}”?`, 'Eliminar');
    if (!ok) return;
    try {
      await remove.mutateAsync(doc.id);
      toast.success('Documento eliminado');
      router.replace('/documents');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Screen
      testID="document-detail"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.secondaryStrong} />}
    >
      <BackButton />
      <View style={styles.titleBlock}>
        <View style={styles.tags}>
          <DocumentTypeTag type={doc.documentType} />
          <View style={[styles.status, doc.status === 'ARCHIVADO' ? styles.statusArchived : styles.statusActive]}>
            <AppText
              variant="caption"
              color={doc.status === 'ARCHIVADO' ? 'warningStrong' : 'successStrong'}
              testID="document-status"
            >
              {doc.status === 'ARCHIVADO' ? 'Archivado' : 'Vigente'}
            </AppText>
          </View>
        </View>
        <AppText variant="title" accessibilityRole="header" testID="document-title">
          {doc.title}
        </AppText>
        {doc.description && <AppText color="textSecondary">{doc.description}</AppText>}
      </View>

      {doc.permissions.canAcknowledge && <AcknowledgeCard doc={doc} />}

      <View style={styles.actions}>
        <Button
          testID="document-download"
          label="Descargar"
          icon={Download}
          loading={busy === 'download'}
          disabled={!!busy}
          onPress={() => void withFile('download')}
        />
        <Button
          testID="document-share"
          label="Compartir"
          icon={Share2}
          variant="secondary"
          loading={busy === 'share'}
          disabled={!!busy}
          onPress={() => void withFile('share')}
        />
        {doc.permissions.canEdit && (
          <Button
            testID="document-edit"
            label="Editar"
            icon={Pencil}
            variant="ghost"
            onPress={() => router.push(`/documents/${doc.id}/edit`)}
          />
        )}
        {doc.permissions.canDelete && (
          <Button testID="document-delete" label="Eliminar" icon={Trash2} variant="danger" onPress={() => void onDelete()} />
        )}
      </View>

      <DocumentPreview doc={doc} />

      <Card>
        <View style={styles.metaGrid}>
          <MetaRow label="Tipo" value={doc.documentType.name} testID="document-type" />
          <MetaRow label="Fecha del documento" value={formatDate(doc.documentDate)} testID="document-date" />
          <MetaRow label="Folio" value={doc.folioNumber ?? '—'} testID="document-folio" />
          <MetaRow label="Autor" value={`${doc.author.fullName} (${ROLE_LABELS[doc.author.role]})`} testID="document-author" />
          <MetaRow label="Archivo" value={`${doc.fileName} · ${formatBytes(doc.fileSize)}`} testID="document-file" />
          <MetaRow label="Subido" value={formatDateTime(doc.createdAt)} />
        </View>
      </Card>

      {doc.visibleRoles && (
        <Card testID="document-audience">
          <AppText variant="subtitle">Visibilidad</AppText>
          <AppText variant="caption">Equipo directivo{doc.visibleRoles.map((r) => `, ${ROLE_LABELS[r]}`).join('')}</AppText>
          {doc.courses && doc.courses.length > 0 && (
            <AppText variant="caption">Apoderados de: {doc.courses.map((c) => c.name).join(', ')}</AppText>
          )}
          {doc.recipients && doc.recipients.length > 0 && (
            <View style={styles.recipients}>
              <AppText variant="label">Destinatarios</AppText>
              {doc.recipients.map((r) => (
                <AppText key={r.id} variant="body">
                  {r.fullName} · {ROLE_LABELS[r.role]}
                </AppText>
              ))}
            </View>
          )}
        </Card>
      )}

      {doc.permissions.canViewDownloads && <ReceiptsReport doc={doc} />}
      {doc.permissions.canViewDownloads && <DownloadsLog doc={doc} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  logPerson: { flexGrow: 1, flexShrink: 1, flexBasis: 160 },
  titleBlock: { gap: spacing.xs },
  tags: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  status: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  statusActive: { backgroundColor: colors.success },
  statusArchived: { backgroundColor: colors.warning },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md },
  metaRow: { flexBasis: 240, flexGrow: 1, gap: 2 },
  recipients: { gap: spacing.xxs, marginTop: spacing.sm },
  logRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: spacing.xxs,
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logEmpty: { marginTop: spacing.xs },
});
