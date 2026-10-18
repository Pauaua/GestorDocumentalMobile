import { Image } from 'expo-image';
import { Eye, FileType2 } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { usePreviewUrl } from '@/hooks/use-preview-url';
import { documentsApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/client';
import { openPreview } from '@/lib/files/file-actions';
import type { DocumentItem } from '@/lib/types';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './ui/app-text';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { toast } from './ui/toast';

/** Móvil: imágenes dentro de la app; PDF en el navegador del sistema. */
export function DocumentPreview({ doc }: { doc: DocumentItem }) {
  const isImage = doc.mimeType.startsWith('image/');
  const isPdf = doc.mimeType === 'application/pdf';
  const preview = usePreviewUrl(doc, isImage);

  if (isImage) {
    if (preview.isLoading) return <Skeleton height={240} rounded={radius.lg} />;
    if (!preview.data) return null;
    return (
      <Image
        testID="document-preview-image"
        source={{ uri: preview.data.url }}
        style={styles.image}
        contentFit="contain"
        accessibilityLabel={`Vista previa de ${doc.title}`}
      />
    );
  }

  return (
    <View style={styles.placeholder}>
      <FileType2 size={28} color={colors.secondaryStrong} strokeWidth={1.5} />
      <AppText variant="caption" align="center">
        {isPdf ? 'Abre el PDF para verlo completo.' : 'Los archivos DOCX no tienen vista previa. Descárgalo para abrirlo.'}
      </AppText>
      {isPdf && (
        <Button
          testID="document-preview-open"
          label="Ver vista previa"
          icon={Eye}
          variant="secondary"
          compact
          onPress={async () => {
            try {
              const { url } = await documentsApi.downloadUrl(doc.id, 'inline');
              await openPreview(url);
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: 320, borderRadius: radius.lg, backgroundColor: colors.background },
  placeholder: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.secondarySoft,
  },
});
