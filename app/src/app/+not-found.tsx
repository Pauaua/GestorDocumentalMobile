import { Link, Stack } from 'expo-router';
import { Compass } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { EmptyState } from '@/components/ui/empty-state';
import { colors, spacing } from '@/theme';

export default function NotFound() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Página no encontrada' }} />
      <EmptyState icon={Compass} title="Esta página no existe" message="Revisa la dirección o vuelve al inicio." />
      <Link href="/" style={styles.link}>
        <AppText variant="bodyStrong" color="primaryStrong">Ir al inicio</AppText>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: spacing.lg },
  link: { marginTop: spacing.sm },
});
