import { FileType2 } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import type { DocumentItem } from '@/lib/types';
import { colors, radius, spacing } from '@/theme';
import { usePreviewUrl } from '@/hooks/use-preview-url';
import { AppText } from './ui/app-text';
import { Skeleton } from './ui/skeleton';

/** Web: PDF en un iframe y las imágenes con <img>, usando una URL firmada "inline". */
export function DocumentPreview({ doc }: { doc: DocumentItem }) {
  const isImage = doc.mimeType.startsWith('image/');
  const isPdf = doc.mimeType === 'application/pdf';
  const preview = usePreviewUrl(doc, isImage || isPdf);

  if (!isImage && !isPdf) {
    return (
      <View style={styles.placeholder}>
        <FileType2 size={28} color={colors.secondaryStrong} strokeWidth={1.5} />
        <AppText variant="caption" align="center">
          Los archivos DOCX no tienen vista previa. Descárgalo para abrirlo.
        </AppText>
      </View>
    );
  }
  if (preview.isLoading) return <Skeleton height={420} rounded={radius.lg} />;
  if (!preview.data) return null;

  const frameStyle = { width: '100%', height: 520, border: 'none', borderRadius: radius.lg, backgroundColor: colors.background };
  return isImage ? (
    <img
      data-testid="document-preview-image"
      src={preview.data.url}
      alt={`Vista previa de ${doc.title}`}
      style={{ ...frameStyle, height: 'auto', maxHeight: 520, objectFit: 'contain' }}
    />
  ) : (
    <iframe data-testid="document-preview-pdf" title={`Vista previa de ${doc.title}`} src={preview.data.url} style={frameStyle} />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.secondarySoft,
  },
});
