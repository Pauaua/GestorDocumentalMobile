import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './ui/app-text';

export function BackButton({ fallback = '/documents' as const, label = 'Volver' }: { fallback?: '/documents' | '/'; label?: string }) {
  return (
    <Pressable
      testID="back-button"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <ChevronLeft size={20} color={colors.secondaryStrong} strokeWidth={1.75} />
      <AppText variant="bodyStrong" color="secondaryStrong">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    paddingVertical: spacing.xxs,
    paddingRight: spacing.sm,
    borderRadius: radius.sm,
  },
  pressed: { opacity: 0.7 },
});
