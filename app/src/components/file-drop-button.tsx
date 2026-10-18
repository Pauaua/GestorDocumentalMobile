import { FileCheck2, UploadCloud } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatBytes } from '@/lib/format';
import type { PickedFile } from '@/lib/files/types';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './ui/app-text';

interface FileDropButtonProps {
  file: PickedFile | null;
  onPress: () => void;
  error?: string;
  disabled?: boolean;
}

export function FileDropButton({ file, onPress, error, disabled }: FileDropButtonProps) {
  const Icon = file ? FileCheck2 : UploadCloud;
  return (
    <View style={styles.wrapper}>
      <Pressable
        testID="upload-pick-file"
        accessibilityRole="button"
        accessibilityLabel={file ? `Archivo seleccionado: ${file.name}. Cambiar archivo` : 'Elegir archivo'}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.zone,
          file && styles.zoneSelected,
          !!error && styles.zoneError,
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.iconBubble, file && styles.iconBubbleSelected]}>
          <Icon size={26} color={file ? colors.successStrong : colors.secondaryStrong} strokeWidth={1.6} />
        </View>
        {file ? (
          <View style={styles.text}>
            <AppText variant="bodyStrong" numberOfLines={1} testID="upload-file-name">
              {file.name}
            </AppText>
            <AppText variant="caption">{formatBytes(file.size)} · Toca para cambiar</AppText>
          </View>
        ) : (
          <View style={styles.text}>
            <AppText variant="bodyStrong">Elegir archivo</AppText>
            <AppText variant="caption">PDF, DOCX, JPG o PNG · máximo 10 MB</AppText>
          </View>
        )}
      </Pressable>
      {error && (
        <AppText variant="caption" color="dangerStrong" testID="upload-file-error">
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  zone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.secondary,
    backgroundColor: colors.secondarySoft,
  },
  zoneSelected: { borderStyle: 'solid', borderColor: colors.success, backgroundColor: colors.surface },
  zoneError: { borderColor: colors.danger },
  pressed: { opacity: 0.8 },
  iconBubble: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubbleSelected: { backgroundColor: colors.success },
  text: { flex: 1, gap: 2 },
});
