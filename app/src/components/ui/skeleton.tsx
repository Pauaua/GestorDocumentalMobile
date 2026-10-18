import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, spacing } from '@/theme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  rounded?: number;
}

/** Bloque con pulso suave mientras cargan los datos. */
export function Skeleton({ width = '100%', height = 14, rounded = radius.sm }: SkeletonProps) {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.set(withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true));
    return () => cancelAnimation(opacity);
  }, [opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[{ width, height, borderRadius: rounded, backgroundColor: colors.primarySoft }, pulse]} />;
}

export function DocumentCardSkeleton() {
  return (
    <View style={styles.card} accessibilityLabel="Cargando documento">
      <View style={styles.row}>
        <Skeleton width={44} height={44} rounded={radius.sm} />
        <View style={styles.lines}>
          <Skeleton width="70%" height={16} />
          <Skeleton width="45%" height={12} />
        </View>
      </View>
      <Skeleton width={110} height={24} rounded={radius.pill} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  lines: { flex: 1, gap: spacing.xs },
});
