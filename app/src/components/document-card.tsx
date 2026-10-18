import { Archive, CalendarDays, UserRound } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { formatDate } from '@/lib/format';
import type { DocumentItem } from '@/lib/types';
import { colors, fonts, radius, spacing } from '@/theme';
import { DocumentTypeIcon, DocumentTypeTag } from './document-type-tag';
import { AppText } from './ui/app-text';
import { Card } from './ui/card';

export function DocumentCard({ doc, onPress }: { doc: DocumentItem; onPress: () => void }) {
  return (
    <Card onPress={onPress} testID={`document-card-${doc.id}`} accessibilityLabel={`Abrir documento ${doc.title}`}>
      <View style={styles.row}>
        <DocumentTypeIcon code={doc.documentType.code} />
        <View style={styles.body}>
          <AppText variant="bodyStrong" numberOfLines={2} testID="card-title">
            {doc.title}
          </AppText>
          <View style={styles.meta}>
            <View style={styles.metaItem}>
              <CalendarDays size={13} color={colors.textSecondary} strokeWidth={1.75} />
              <AppText variant="caption">{formatDate(doc.documentDate)}</AppText>
            </View>
            <View style={styles.metaItem}>
              <UserRound size={13} color={colors.textSecondary} strokeWidth={1.75} />
              <AppText variant="caption" numberOfLines={1}>
                {doc.author.fullName}
              </AppText>
            </View>
            {doc.folioNumber && <AppText variant="caption">Folio {doc.folioNumber}</AppText>}
          </View>
          <View style={styles.tags}>
            <DocumentTypeTag type={doc.documentType} />
            {doc.status === 'ARCHIVADO' && (
              <View style={styles.archived}>
                <Archive size={12} color={colors.warningStrong} strokeWidth={2} />
                <AppText style={styles.archivedLabel}>Archivado</AppText>
              </View>
            )}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  body: { flex: 1, gap: spacing.xs },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  tags: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  archived: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.warning,
  },
  archivedLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.warningStrong },
});
