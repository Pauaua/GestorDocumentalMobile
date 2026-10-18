import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, LogOut, Network, Plus, ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { toast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/client';
import { PLAN_LABELS, platformApi, usePlatformSession, type Plan, type PlatformSchool } from '@/lib/api/platform';
import { normalizeRut } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

const PLANS = Object.keys(PLAN_LABELS) as Plan[];
const keys = { schools: ['platform', 'schools'] as const, orgs: ['platform', 'organizations'] as const };

function PlatformLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await platformApi.login(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(errorMessage(err, 'No pudimos iniciar sesión'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={styles.section} testID="platform-login">
      <View style={styles.row}>
        <ShieldCheck size={22} color={colors.secondaryStrong} strokeWidth={1.6} />
        <AppText variant="subtitle">Consola de RTLCO</AppText>
      </View>
      <AppText variant="caption">Solo para el equipo de RTLCO. Desde aquí no se ven documentos de los colegios.</AppText>
      <TextField testID="platform-email" label="Correo" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextField
        testID="platform-password"
        label="Contraseña"
        secureTextEntry
        secureToggle
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={() => void submit()}
        error={error ?? undefined}
      />
      <Button testID="platform-login-submit" label="Ingresar" loading={busy} onPress={() => void submit()} />
    </Card>
  );
}

function SchoolRow({ school }: { school: PlatformSchool }) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (input: Parameters<typeof platformApi.updateSchool>[1]) => platformApi.updateSchool(school.id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.schools }),
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <View style={[styles.item, !school.isActive && styles.inactive]} testID={`platform-school-${school.slug}`}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{school.name}</AppText>
        <AppText variant="caption">
          {school.slug} · {school._count.memberships} miembros · {school._count.documents} documentos
          {school.organization ? ` · ${school.organization.name}` : ''}
        </AppText>
        <View style={styles.chips}>
          {PLANS.map((p) => (
            <Chip key={p} label={PLAN_LABELS[p]} selected={school.plan === p} onPress={() => school.plan !== p && update.mutate({ plan: p })} />
          ))}
        </View>
      </View>
      <View style={styles.toggle}>
        <AppText variant="caption">{school.isActive ? 'Activo' : 'Suspendido'}</AppText>
        <Switch
          testID={`platform-school-active-${school.slug}`}
          accessibilityLabel={`${school.isActive ? 'Suspender' : 'Reactivar'} ${school.name}`}
          value={school.isActive}
          disabled={update.isPending}
          onValueChange={(isActive) => update.mutate({ isActive })}
          trackColor={{ false: colors.border, true: colors.success }}
          thumbColor={colors.surface}
        />
      </View>
    </View>
  );
}

function NewSchoolForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const orgs = useQuery({ queryKey: keys.orgs, queryFn: platformApi.organizations });
  const [form, setForm] = useState({ name: '', slug: '', rbd: '', plan: 'basico' as Plan, organizationId: null as string | null });
  const [director, setDirector] = useState({ fullName: '', rut: '', email: '' });
  const create = useMutation({
    mutationFn: () =>
      platformApi.createSchool({
        ...form,
        rbd: form.rbd || null,
        director: { ...director, rut: normalizeRut(director.rut), email: director.email.trim().toLowerCase() },
      }),
    onSuccess: async (school) => {
      toast.success(
        school.director.invitationSent ? `Colegio creado: invitamos a ${director.email} a activar su cuenta` : 'Colegio creado: la cuenta ya existía',
      );
      await qc.invalidateQueries({ queryKey: keys.schools });
      onDone();
    },
    onError: (err) => toast.error(errorMessage(err, 'No se pudo crear el colegio')),
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setD = (k: keyof typeof director) => (v: string) => setDirector((d) => ({ ...d, [k]: v }));

  return (
    <Card style={styles.section} testID="platform-new-school">
      <AppText variant="subtitle">Nuevo colegio</AppText>
      <TextField label="Nombre" value={form.name} onChangeText={set('name')} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label="Subdominio"
            autoCapitalize="none"
            value={form.slug}
            onChangeText={(v) => set('slug')(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            hint={form.slug ? `${form.slug}.rtlco.cl` : 'Ej.: san-andres'}
          />
        </View>
        <View style={styles.flex}>
          <TextField label="RBD (opcional)" value={form.rbd} onChangeText={set('rbd')} />
        </View>
      </View>
      <AppText variant="label">Plan</AppText>
      <View style={styles.chips}>
        {PLANS.map((p) => (
          <Chip key={p} label={PLAN_LABELS[p]} selected={form.plan === p} onPress={() => setForm((f) => ({ ...f, plan: p }))} />
        ))}
      </View>
      {!!orgs.data?.length && (
        <>
          <AppText variant="label">Red (opcional)</AppText>
          <View style={styles.chips}>
            {orgs.data.map((o) => (
              <Chip
                key={o.id}
                label={o.name}
                selected={form.organizationId === o.id}
                onPress={() => setForm((f) => ({ ...f, organizationId: f.organizationId === o.id ? null : o.id }))}
              />
            ))}
          </View>
        </>
      )}
      <AppText variant="label">Director(a) inicial · recibirá una invitación por correo</AppText>
      <TextField label="Nombre completo" value={director.fullName} onChangeText={setD('fullName')} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField label="RUT" autoCapitalize="characters" value={director.rut} onChangeText={setD('rut')} />
        </View>
        <View style={styles.flex}>
          <TextField label="Correo" autoCapitalize="none" keyboardType="email-address" value={director.email} onChangeText={setD('email')} />
        </View>
      </View>
      <View style={styles.row}>
        <Button testID="platform-create-school" label="Crear colegio" icon={Plus} loading={create.isPending} onPress={() => create.mutate()} />
        <Button label="Cancelar" variant="ghost" onPress={onDone} />
      </View>
    </Card>
  );
}

function Organizations() {
  const qc = useQueryClient();
  const orgs = useQuery({ queryKey: keys.orgs, queryFn: platformApi.organizations });
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => platformApi.createOrganization({ name }),
    onSuccess: () => {
      setName('');
      toast.success('Red creada');
      return qc.invalidateQueries({ queryKey: keys.orgs });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Card style={styles.section} testID="platform-organizations">
      <View style={styles.row}>
        <Network size={20} color={colors.primaryStrong} strokeWidth={1.6} />
        <AppText variant="subtitle">Redes de colegios</AppText>
      </View>
      {orgs.data?.map((o) => (
        <View key={o.id} style={styles.item}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{o.name}</AppText>
            <AppText variant="caption">
              {o.schools.length} colegios · Sostenedor(es): {o.admins.map((a) => a.user.fullName).join(', ') || 'sin asignar'}
            </AppText>
          </View>
        </View>
      ))}
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField label="Nueva red" placeholder="Ej.: Fundación Educacional Sur" value={name} onChangeText={setName} />
        </View>
        <Button label="Crear" compact disabled={name.trim().length < 3} loading={create.isPending} onPress={() => create.mutate()} />
      </View>
      <AppText variant="caption">El sostenedor de una red se agrega por la API (POST /platform/organizations/:id/admins).</AppText>
    </Card>
  );
}

export function PlatformScreen() {
  const token = usePlatformSession((s) => s.token);
  const name = usePlatformSession((s) => s.name);
  const clear = usePlatformSession((s) => s.clear);
  const [creating, setCreating] = useState(false);
  const schools = useQuery({ queryKey: keys.schools, queryFn: platformApi.schools, enabled: !!token });

  if (!token) {
    return (
      <Screen testID="platform-screen" title="RTLCO · Plataforma">
        <PlatformLogin />
      </Screen>
    );
  }

  const active = schools.data?.filter((s) => s.isActive).length ?? 0;
  return (
    <Screen
      testID="platform-screen"
      title="RTLCO · Plataforma"
      subtitle={schools.data ? `${schools.data.length} colegios · ${active} activos · ${name}` : (name ?? undefined)}
      headerRight={<Button label="Salir" icon={LogOut} variant="ghost" compact onPress={clear} />}
    >
      {creating ? (
        <NewSchoolForm onDone={() => setCreating(false)} />
      ) : (
        <Button testID="platform-new" label="Nuevo colegio" icon={Building2} onPress={() => setCreating(true)} />
      )}
      <Card style={styles.section}>
        <AppText variant="subtitle">Colegios</AppText>
        {schools.isLoading ? (
          <Skeleton height={120} rounded={radius.lg} />
        ) : (
          schools.data?.map((s) => <SchoolRow key={s.id} school={s} />)
        )}
      </Card>
      <Organizations />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 160, gap: spacing.xxs },
  section: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inactive: { opacity: 0.6 },
  toggle: { alignItems: 'center', gap: spacing.xxs },
});
