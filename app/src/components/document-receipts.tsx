import { BadgeCheck, CheckCheck, Eye } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useAcknowledgeDocument, useDocumentReceipts } from '@/hooks/use-documents';
import { errorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/permissions';
import type { DocumentItem } from '@/lib/types';
import { colors, radius, spacing } from '@/theme';

/** Audiencia: confirma la recepción (queda registrada la fecha y la IP). */
export function AcknowledgeCard({ doc }: { doc: DocumentItem }) {
  const ack = useAcknowledgeDocument(doc.id);
  const acknowledgedAt = doc.myReceipt?.acknowledgedAt;

  if (acknowledgedAt) {
    return (
      <Card style={[styles.ackCard, styles.ackDone]} testID="document-ack-done">
        <BadgeCheck size={22} color={colors.successStrong} strokeWidth={1.75} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong" color="successStrong">
            Confirmaste la recepción
          </AppText>
          <AppText variant="caption">{formatDateTime(acknowledgedAt)}</AppText>
        </View>
      </Card>
    );
  }

  return (
    <Card style={styles.ackCard} testID="document-ack-pending">
      <View style={styles.flex}>
        <AppText variant="bodyStrong">El colegio pide que confirmes que recibiste este documento</AppText>
        <AppText variant="caption">Al confirmar queda registrada la fecha y hora de tu confirmación.</AppText>
      </View>
      <Button
        testID="document-ack-submit"
        label="Confirmar recepción"
        icon={CheckCheck}
        loading={ack.isPending}
        onPress={async () => {
          try {
            await ack.mutateAsync();
            toast.success('Recepción confirmada');
          } catch (err) {
            toast.error(errorMessage(err, 'No se pudo confirmar la recepción'));
          }
        }}
      />
    </Card>
  );
}

/** Equipo directivo: quién de la audiencia abrió y confirmó el documento. */
export function ReceiptsReport({ doc }: { doc: DocumentItem }) {
  const report = useDocumentReceipts(doc.id, doc.permissions.canViewDownloads);
  const data = report.data;

  return (
    <Card testID="document-receipts">
      <AppText variant="subtitle">Acuses de recibo</AppText>
      {report.isLoading || !data ? (
        <Skeleton height={40} />
      ) : data.summary.audience === 0 && data.items.length === 0 ? (
        <AppText variant="caption">Este documento no tiene destinatarios fuera del equipo directivo.</AppText>
      ) : (
        <>
          <AppText variant="caption" testID="document-receipts-summary">
            {data.summary.viewed} de {data.summary.audience} lo abrieron
            {data.requiresAcknowledgement ? ` · ${data.summary.acknowledged} confirmaron la recepción` : ''}
          </AppText>
          {data.items.map((item) => {
            const confirmed = !!item.acknowledgedAt;
            const Icon = confirmed ? BadgeCheck : Eye;
            return (
              <View key={item.user.id} style={styles.row}>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{item.user.fullName}</AppText>
                  <AppText variant="caption">
                    {ROLE_LABELS[item.user.role]}
                    {item.inAudience ? '' : ' · ya no está en la audiencia'}
                  </AppText>
                </View>
                {item.viewedAt ? (
                  <View style={styles.status}>
                    <Icon size={14} color={confirmed ? colors.successStrong : colors.textSecondary} strokeWidth={1.75} />
                    <AppText variant="caption" color={confirmed ? 'successStrong' : 'textSecondary'}>
                      {confirmed ? `Confirmó ${formatDateTime(item.acknowledgedAt!)}` : `Abrió ${formatDateTime(item.viewedAt)}`}
                    </AppText>
                  </View>
                ) : (
                  <AppText variant="caption" color="warningStrong">
                    Sin abrir
                  </AppText>
                )}
              </View>
            );
          })}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  ackCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  ackDone: { backgroundColor: colors.success },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, borderRadius: radius.pill },
});
