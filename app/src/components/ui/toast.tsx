import { CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { colors, radius, shadows, spacing } from '@/theme';
import { AppText } from './app-text';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: ToastItem[];
  show: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, tone = 'info') => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone }] }));
    setTimeout(() => get().dismiss(id), 3800);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** API imperativa: toast.success('Documento subido'). */
export const toast = {
  success: (message: string) => useToastStore.getState().show(message, 'success'),
  error: (message: string) => useToastStore.getState().show(message, 'error'),
  info: (message: string) => useToastStore.getState().show(message, 'info'),
};

const tones = {
  success: { bg: colors.success, fg: colors.successStrong, icon: CircleCheck },
  error: { bg: colors.dangerSoft, fg: colors.dangerStrong, icon: CircleAlert },
  info: { bg: colors.primarySoft, fg: colors.primaryStrong, icon: Info },
} as const;

function ToastView({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const tone = tones[item.tone];
  const Icon = tone.icon;
  return (
    <Animated.View entering={FadeInUp.springify().damping(18)} exiting={FadeOutUp.duration(180)}>
      <Pressable
        testID={`toast-${item.tone}`}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        onPress={() => dismiss(item.id)}
        style={[styles.toast, { backgroundColor: tone.bg }]}
      >
        <Icon size={20} color={tone.fg} strokeWidth={1.75} />
        <AppText variant="bodyStrong" style={[styles.message, { color: tone.fg }]}>
          {item.message}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + spacing.sm }]}>
      {toasts.map((t) => (
        <ToastView key={t.id} item={t} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center', gap: spacing.xs, zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    maxWidth: 480,
    ...shadows.raised,
  },
  message: { flexShrink: 1 },
});
