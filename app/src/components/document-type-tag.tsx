import { StyleSheet, View } from 'react-native';
import type { DocumentType } from '@/lib/types';
import { documentTypeStyle, fonts, radius, spacing } from '@/theme';
import { AppText } from './ui/app-text';

export function DocumentTypeTag({ type }: { type: Pick<DocumentType, 'code' | 'name'> }) {
  const style = documentTypeStyle(type.code);
  const Icon = style.icon;
  return (
    <View style={[styles.tag, { backgroundColor: style.background }]} testID={`tag-${type.code}`}>
      <Icon size={13} color={style.foreground} strokeWidth={2} />
      <AppText style={[styles.label, { color: style.foreground }]}>{type.name}</AppText>
    </View>
  );
}

export function DocumentTypeIcon({ code, size = 44 }: { code: string; size?: number }) {
  const style = documentTypeStyle(code);
  const Icon = style.icon;
  return (
    <View style={[styles.icon, { width: size, height: size, backgroundColor: style.background }]}>
      <Icon size={size * 0.45} color={style.foreground} strokeWidth={1.6} />
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  label: { fontFamily: fonts.bold, fontSize: 12, flexShrink: 1 },
  icon: { borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
