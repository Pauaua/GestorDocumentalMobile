import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { Building2, FolderLock, Lock, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useIsCompact } from '@/hooks/use-responsive';
import { errorMessage } from '@/lib/api/client';
import { authApi, schoolApi } from '@/lib/api/endpoints';
import { APP_NAME } from '@/lib/config';
import { SLUG_PATTERN, useSchool } from '@/lib/school/store';
import { signIn } from '@/lib/session/actions';
import { colors, gradient, radius, shadows, spacing } from '@/theme';

const schema = z.object({
  email: z.string().trim().min(1, 'Ingresa tu correo').email('Revisa el formato del correo'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});
type FormValues = z.infer<typeof schema>;

/** Paso previo en la app (o en la web sin subdominio): el código del colegio, p. ej. "demo". */
function SchoolStep() {
  const setSlug = useSchool((s) => s.setSlug);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    const slug = code.trim().toLowerCase();
    setError(null);
    if (!SLUG_PATTERN.test(slug)) {
      setError('Escribe el código que te entregó tu colegio');
      return;
    }
    setChecking(true);
    try {
      await schoolApi.get(slug);
      await setSlug(slug);
    } catch (err) {
      const notFound = err instanceof AxiosError && err.response?.status === 404;
      setError(notFound ? 'No encontramos un colegio con ese código' : errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <TextField
        testID="login-school"
        label="Código del colegio"
        icon={Building2}
        placeholder="p. ej. colegio-san-andres"
        autoCapitalize="none"
        autoCorrect={false}
        value={code}
        onChangeText={setCode}
        onSubmitEditing={submit}
        error={error ?? undefined}
        hint="Lo encuentras en la dirección web de tu colegio: código.rtlco.cl"
        returnKeyType="go"
      />
      <Button testID="login-school-submit" label="Continuar" onPress={submit} loading={checking} fullWidth />
    </>
  );
}

/** Pide el enlace de recuperación. La respuesta es la misma exista o no la cuenta. */
function ForgotStep({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const value = email.trim().toLowerCase();
    setError(null);
    if (!z.string().email().safeParse(value).success) return setError('Revisa el formato del correo');
    setSending(true);
    try {
      await authApi.forgotPassword(value);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <>
        <View style={styles.notice} testID="forgot-sent">
          <AppText variant="bodyStrong" align="center">
            Si el correo corresponde a una cuenta de este colegio, te enviamos un enlace para crear una contraseña nueva.
          </AppText>
          <AppText variant="caption" align="center">
            El enlace vence en 1 hora. Revisa también la carpeta de spam.
          </AppText>
        </View>
        <Button testID="forgot-back" label="Volver a iniciar sesión" variant="secondary" onPress={onBack} fullWidth />
      </>
    );
  }

  return (
    <>
      <TextField
        testID="forgot-email"
        label="Correo de tu cuenta"
        icon={Mail}
        placeholder="nombre@colegio.cl"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={() => void submit()}
        error={error ?? undefined}
        returnKeyType="send"
      />
      <Button testID="forgot-submit" label="Enviar enlace" loading={sending} onPress={() => void submit()} fullWidth />
      <Pressable accessibilityRole="button" testID="forgot-cancel" onPress={onBack}>
        <AppText variant="caption" color="secondaryStrong" align="center">
          Volver a iniciar sesión
        </AppText>
      </Pressable>
    </>
  );
}

function CredentialsStep({ onForgot }: { onForgot: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (err) {
      setServerError(errorMessage(err, 'No pudimos iniciar sesión'));
    }
  });

  return (
    <>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            testID="login-email"
            label="Correo institucional"
            icon={Mail}
            placeholder="nombre@colegio.cl"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="username"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
            returnKeyType="next"
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            testID="login-password"
            label="Contraseña"
            icon={Lock}
            placeholder="Tu contraseña"
            secureTextEntry
            secureToggle
            autoComplete="current-password"
            textContentType="password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={onSubmit}
            error={errors.password?.message}
            returnKeyType="go"
          />
        )}
      />

      {serverError && (
        <View style={styles.error} accessibilityRole="alert" testID="login-error">
          <AppText variant="bodyStrong" color="dangerStrong" align="center">
            {serverError}
          </AppText>
        </View>
      )}

      <Button testID="login-submit" label="Ingresar" onPress={onSubmit} loading={isSubmitting} fullWidth />
      <Pressable accessibilityRole="button" testID="login-forgot" onPress={onForgot}>
        <AppText variant="caption" color="secondaryStrong" align="center">
          ¿Olvidaste tu contraseña?
        </AppText>
      </Pressable>
    </>
  );
}

export function LoginScreen() {
  const compact = useIsCompact();
  const slug = useSchool((s) => s.slug);
  const fixed = useSchool((s) => s.fixed);
  const clearSlug = useSchool((s) => s.clearSlug);
  const school = useQuery({ queryKey: ['school', slug], queryFn: () => schoolApi.get(), enabled: !!slug });
  const [forgot, setForgot] = useState(false);

  return (
    <LinearGradient colors={[...gradient]} style={styles.fill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.scroll, compact && styles.scrollCompact]} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, compact && styles.cardCompact]} testID="login-screen">
            <View style={styles.logo}>
              <FolderLock size={34} color={colors.secondaryStrong} strokeWidth={1.5} />
            </View>
            <View style={styles.heading}>
              <AppText variant="display" align="center" accessibilityRole="header">
                {APP_NAME}
              </AppText>
              {slug && (
                <AppText variant="bodyStrong" color="textSecondary" align="center" testID="login-school-name">
                  {school.data?.name ?? (school.isError ? 'Colegio no disponible' : ' ')}
                </AppText>
              )}
              {slug && !fixed && (
                <Pressable accessibilityRole="button" testID="login-change-school" onPress={() => void clearSlug()}>
                  <AppText variant="caption" color="secondaryStrong" align="center">
                    Cambiar de colegio
                  </AppText>
                </Pressable>
              )}
            </View>

            {!slug ? (
              <SchoolStep />
            ) : forgot ? (
              <ForgotStep onBack={() => setForgot(false)} />
            ) : (
              <CredentialsStep onForgot={() => setForgot(true)} />
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
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.secondarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { gap: 2, marginBottom: spacing.xs },
  error: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.sm },
  notice: { gap: spacing.xs, backgroundColor: colors.secondarySoft, borderRadius: radius.md, padding: spacing.md },
});
