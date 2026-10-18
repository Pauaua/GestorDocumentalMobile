import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/nunito';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastHost } from '@/components/ui/toast';
import { queryClient } from '@/lib/query-client';
import { restoreSession } from '@/lib/session/actions';
import { useSession } from '@/lib/session/store';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold });
  const status = useSession((s) => s.status);

  useEffect(() => {
    void restoreSession();
  }, []);

  const ready = fontsLoaded && status !== 'loading';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) {
    return (
      <View style={styles.loading} testID="app-loading">
        <ActivityIndicator color={colors.secondaryStrong} />
      </View>
    );
  }

  const signedIn = status === 'authenticated';
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          {/* Rutas protegidas: sin sesión, Expo Router redirige al login y viceversa. */}
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="login" options={{ title: 'Iniciar sesión' }} />
          </Stack.Protected>
          {/* Enlace de los correos de invitación y recuperación: disponible con o sin sesión. */}
          <Stack.Screen name="reset-password" options={{ title: 'Contraseña' }} />
          {/* Consola de RTLCO (superadmin), con su propia sesión: recomendado en admin.rtlco.cl/plataforma. */}
          <Stack.Screen name="plataforma" options={{ title: 'Plataforma' }} />
        </Stack>
        <ToastHost />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
