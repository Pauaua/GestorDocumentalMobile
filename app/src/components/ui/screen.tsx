import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsWide } from '@/hooks/use-responsive';
import { colors, layout, spacing } from '@/theme';
import { AppText } from './app-text';

interface ScreenProps {
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  testID?: string;
  /** Encabezado propio en lugar del título simple. */
  header?: ReactNode;
}

/** Contenedor de pantalla: fondo, safe area, ancho máximo en web y título. */
export function Screen({ title, subtitle, headerRight, children, scroll = true, refreshControl, testID, header }: ScreenProps) {
  const wide = useIsWide();
  const content = (
    <View style={[styles.inner, wide && styles.innerWide]}>
      {header ??
        (title && (
          <View style={styles.header}>
            <View style={styles.headerText}>
              <AppText variant="title" accessibilityRole="header" testID={testID ? `${testID}-title` : undefined}>
                {title}
              </AppText>
              {subtitle && <AppText variant="caption">{subtitle}</AppText>}
            </View>
            {headerRight}
          </View>
        ))}
      {children}
    </View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']} testID={testID}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        <View style={styles.fill}>{content}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: spacing.xxl },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  innerWide: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  // Si el título y la acción de la derecha no caben juntos, la acción baja a la línea siguiente.
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headerText: { flexGrow: 1, flexShrink: 1, flexBasis: 200, gap: 2 },
});
