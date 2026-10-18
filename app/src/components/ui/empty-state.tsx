import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './app-text';
import { Button } from './button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export function EmptyState({ icon: Icon, title, message, actionLabel, onAction, testID }: EmptyStateProps) {
  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.iconBubble}>
        <Icon size={32} color={colors.secondaryStrong} strokeWidth={1.5} />
      </View>
      <AppText variant="subtitle" align="center">
        {title}
      </AppText>
      <AppText variant="body" color="textSecondary" align="center" style={styles.message}>
        {message}
      </AppText>
      {actionLabel && onAction && <Button label={actionLabel} onPress={onAction} variant="secondary" compact />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg, gap: spacing.sm },
  iconBubble: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.secondarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  message: { maxWidth: 360 },
});
