import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyRound, Lock, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { toast } from '@/components/ui/toast';
import { useIsCompact } from '@/hooks/use-responsive';
import { errorMessage } from '@/lib/api/client';
import { authApi } from '@/lib/api/endpoints';
import { signOut } from '@/lib/session/actions';
import { useSession } from '@/lib/session/store';
import { colors, gradient, radius, shadows, spacing } from '@/theme';

const validPassword = (v: string) => v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v);

/** Enlace del correo de invitación o de recuperación: /reset-password?token=... */
export function ResetPasswordScreen() {
  const compact = useIsCompact();
  const { token = '' } = useLocalSearchParams<{ token?: string }>();
  const signedIn = useSession((s) => s.status === 'authenticated');
  const info = useQuery({ queryKey: ['password-token', token], queryFn: () => authApi.passwordToken(token), enabled: !!token, retry: false });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const invite = info.data?.purpose === 'invite';

  const submit = async () => {
    setError(null);
    if (!validPassword(password)) return setError('Usa al menos 8 caracteres, con letras y números');
    if (password !== confirm) return setError('Las contraseñas no coinciden');
    setSaving(true);
    try {
      await authApi.resetPassword(token, password);
      // Se cerraron todas las sesiones: también la de este dispositivo si la había.
      if (signedIn) await signOut();
      toast.success(invite ? 'Cuenta activada: ya puedes iniciar sesión' : 'Contraseña actualizada');
      router.replace('/login');
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la contraseña'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <LinearGradient colors={[...gradient]} style={styles.fill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, compact && styles.cardCompact]} testID="reset-screen">
            {!token || info.isError ? (
              <EmptyState
                testID="reset-invalid"
                icon={TriangleAlert}
                title="El enlace no es válido o expiró"
                message="Pide un enlace nuevo desde “¿Olvidaste tu contraseña?” o a la dirección de tu colegio."
                actionLabel="Ir a iniciar sesión"
                onAction={() => router.replace('/login')}
              />
            ) : info.isLoading ? (
              <Skeleton height={200} rounded={radius.lg} />
            ) : (
              <>
                <View style={styles.logo}>
                  <KeyRound size={32} color={colors.secondaryStrong} strokeWidth={1.5} />
                </View>
                <AppText variant="title" align="center" accessibilityRole="header">
                  {invite ? 'Activa tu cuenta' : 'Crea una contraseña nueva'}
                </AppText>
                <AppText color="textSecondary" align="center">
                  Hola {info.data?.fullName}. {invite ? 'Elige la contraseña con la que entrarás a RTLCO.' : 'Elige tu nueva contraseña.'}
                </AppText>
                <TextField
                  testID="reset-password"
                  label="Contraseña"
                  icon={Lock}
                  secureTextEntry
                  secureToggle
                  autoComplete="new-password"
                  textContentType="newPassword"
                  value={password}
                  onChangeText={setPassword}
                  hint="Mínimo 8 caracteres, con letras y números"
                />
                <TextField
                  testID="reset-confirm"
                  label="Repite la contraseña"
                  icon={Lock}
                  secureTextEntry
                  autoComplete="new-password"
                  value={confirm}
                  onChangeText={setConfirm}
                  onSubmitEditing={() => void submit()}
                  error={error ?? undefined}
                />
                <Button testID="reset-submit" label={invite ? 'Activar cuenta' : 'Guardar contraseña'} loading={saving} onPress={() => void submit()} fullWidth />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  scrollCompact: { padding: spacing.sm },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.raised,
  },
  cardCompact: { padding: spacing.lg },
  logo: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.secondarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
