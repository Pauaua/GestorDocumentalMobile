import { LinearGradient } from 'expo-linear-gradient';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Bell, FileText, House, UploadCloud, UserRound, UsersRound, type LucideIcon } from 'lucide-react-native';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, View, type View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnreadCount } from '@/hooks/use-notifications';
import { useIsWide } from '@/hooks/use-responsive';
import { APP_NAME } from '@/lib/config';
import { canUpload, isAdmin, ROLE_LABELS } from '@/lib/permissions';
import { useSession } from '@/lib/session/store';
import { colors, fonts, gradient, layout, radius, spacing } from '@/theme';
import { AppText } from './ui/app-text';

interface NavItem {
  name: string;
  href: '/' | '/documents' | '/upload' | '/users' | '/notifications' | '/profile';
  label: string;
  icon: LucideIcon;
  /** Contador (avisos sin leer). */
  badge?: number;
}

type NavButtonProps = TabTriggerSlotProps & { item: NavItem; wide: boolean };

const NavButton = forwardRef<RNView, NavButtonProps>(function NavButton({ item, wide, isFocused, ...props }, ref) {
  const Icon = item.icon;
  return (
    <Pressable
      ref={ref}
      {...props}
      testID={`nav-${item.name}`}
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected: !!isFocused }}
      style={({ pressed }) => [
        wide ? styles.sideItem : styles.bottomItem,
        isFocused && (wide ? styles.sideItemActive : styles.bottomItemActive),
        pressed && styles.pressed,
      ]}
    >
      <View>
        <Icon size={wide ? 20 : 22} color={isFocused ? colors.secondaryStrong : colors.textSecondary} strokeWidth={1.6} />
        {!!item.badge && (
          <View style={styles.badge} testID={`nav-${item.name}-badge`}>
            <AppText style={styles.badgeText}>{item.badge > 99 ? '99+' : item.badge}</AppText>
          </View>
        )}
      </View>
      <AppText
        style={[wide ? styles.sideLabel : styles.bottomLabel, { color: isFocused ? colors.secondaryStrong : colors.textSecondary }]}
      >
        {item.label}
      </AppText>
    </Pressable>
  );
});

/**
 * Navegación principal según el rol. Móvil y web angosta: tabs inferiores.
 * Web ancha: barra lateral. Apoderados y docentes solo ven Inicio, Documentos y Perfil.
 */
export function AppNavigation() {
  const role = useSession((s) => s.user?.role);
  const user = useSession((s) => s.user);
  const wide = useIsWide();
  const insets = useSafeAreaInsets();
  const unread = useUnreadCount();

  const items: NavItem[] = [
    { name: 'home', href: '/', label: 'Inicio', icon: House },
    { name: 'documents', href: '/documents', label: 'Documentos', icon: FileText },
    ...(canUpload(role) ? [{ name: 'upload', href: '/upload' as const, label: 'Subir', icon: UploadCloud }] : []),
    ...(isAdmin(role) ? [{ name: 'users', href: '/users' as const, label: 'Usuarios', icon: UsersRound }] : []),
    { name: 'notifications', href: '/notifications', label: 'Avisos', icon: Bell, badge: unread },
    { name: 'profile', href: '/profile', label: 'Perfil', icon: UserRound },
  ];

  return (
    <Tabs style={[styles.root, wide && styles.rootWide]}>
      <TabList
        style={
          wide ? styles.sidebar : [styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.xs) }]
        }
      >
        {wide && (
          <LinearGradient colors={[...gradient]} style={styles.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <AppText variant="subtitle">{APP_NAME}</AppText>
            <AppText variant="caption" color="text">
              {user?.school.name}
            </AppText>
          </LinearGradient>
        )}
        {items.map((item) => (
          <TabTrigger key={item.name} name={item.name} href={item.href} asChild>
            <NavButton item={item} wide={wide} />
          </TabTrigger>
        ))}
        {wide && user && (
          <View style={styles.sideFooter}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {user.fullName}
            </AppText>
            <AppText variant="caption">{ROLE_LABELS[user.role]}</AppText>
          </View>
        )}
      </TabList>
      <TabSlot style={styles.slot} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'column-reverse', backgroundColor: colors.background },
  rootWide: { flexDirection: 'row' },
  slot: { flex: 1 },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.dangerStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.surface, fontFamily: fonts.bold, fontSize: 10, lineHeight: 12 },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: spacing.xs,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bottomItem: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.xxs, borderRadius: radius.md },
  bottomItemActive: { backgroundColor: colors.secondarySoft },
  bottomLabel: { fontFamily: fonts.semibold, fontSize: 11 },
  sidebar: {
    width: layout.sidebarWidth,
    flexDirection: 'column',
    gap: spacing.xxs,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  brand: { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, gap: 2 },
  sideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  sideItemActive: { backgroundColor: colors.secondarySoft },
  sideLabel: { fontFamily: fonts.bold, fontSize: 15 },
  sideFooter: {
    marginTop: 'auto',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    gap: 2,
  },
  pressed: { opacity: 0.75 },
});
