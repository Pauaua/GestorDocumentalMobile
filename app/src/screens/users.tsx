import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, router } from 'expo-router';
import { ChevronDown, ChevronUp, FileSpreadsheet, History, MailPlus, Search, UserPlus, UsersRound, X } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { z } from 'zod';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { toast } from '@/components/ui/toast';
import { useCreateUser, useUpdateUser, useUsers } from '@/hooks/use-users';
import { errorMessage } from '@/lib/api/client';
import { usersApi } from '@/lib/api/endpoints';
import { isValidRut, normalizeRut } from '@/lib/format';
import { ALL_ROLES, isAdmin, ROLE_LABELS } from '@/lib/permissions';
import { useSession } from '@/lib/session/store';
import type { Member, Role } from '@/lib/types';
import { colors, radius, spacing } from '@/theme';

const createSchema = z.object({
  fullName: z.string().trim().min(3, 'Ingresa el nombre completo'),
  rut: z.string().trim().refine(isValidRut, 'RUT inválido (ej.: 12345678-5)'),
  email: z.string().trim().email('Correo inválido'),
  phone: z.string().trim().max(20).optional(),
  // Vacía: la persona recibe una invitación por correo para crear su contraseña.
  password: z
    .string()
    .refine((v) => v === '' || (v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v)), 'Mínimo 8 caracteres, con letras y números'),
  role: z.enum(['director', 'sostenedor', 'equipo_directivo', 'docente', 'apoderado']),
});
type CreateValues = z.infer<typeof createSchema>;

function CreateUserForm({ onDone }: { onDone: () => void }) {
  const create = useCreateUser();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { fullName: '', rut: '', email: '', phone: '', password: '', role: 'apoderado' },
  });

  const submit = handleSubmit(async (v) => {
    try {
      const created = await create.mutateAsync({
        ...v,
        rut: normalizeRut(v.rut),
        email: v.email.toLowerCase(),
        phone: v.phone || null,
        password: v.password || undefined,
      });
      // Una cuenta existente se agrega al colegio sin cambiar su contraseña.
      toast.success(
        created.existingAccount
          ? 'Ya tenía cuenta en RTLCO: se agregó al colegio con su contraseña actual'
          : created.invitationSent
            ? 'Usuario creado: le enviamos una invitación por correo'
            : 'Usuario creado',
      );
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo crear el usuario'));
    }
  });

  const field = (name: 'fullName' | 'rut' | 'email' | 'phone' | 'password', label: string, extra: object = {}) => (
    <Controller
      control={control}
      name={name}
      render={({ field: f }) => (
        <TextField
          testID={`user-form-${name}`}
          label={label}
          value={f.value}
          onChangeText={f.onChange}
          onBlur={f.onBlur}
          error={errors[name]?.message}
          {...extra}
        />
      )}
    />
  );

  return (
    <Card style={styles.form} testID="user-form">
      <View style={styles.formHeader}>
        <AppText variant="subtitle">Nuevo usuario</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar formulario" onPress={onDone} hitSlop={8}>
          <X size={20} color={colors.textSecondary} strokeWidth={1.75} />
        </Pressable>
      </View>
      {field('fullName', 'Nombre completo')}
      <View style={styles.row}>
        <View style={styles.flex}>{field('rut', 'RUT', { placeholder: '12345678-5', autoCapitalize: 'characters' })}</View>
        <View style={styles.flex}>{field('phone', 'Teléfono (opcional)', { keyboardType: 'phone-pad' })}</View>
      </View>
      {field('email', 'Correo', { keyboardType: 'email-address', autoCapitalize: 'none' })}
      {field('password', 'Contraseña inicial (opcional)', {
        secureTextEntry: true,
        secureToggle: true,
        hint: 'Déjala vacía para enviarle una invitación por correo y que la cree la persona',
      })}
      <Controller
        control={control}
        name="role"
        render={({ field: f }) => (
          <View style={styles.roles}>
            <AppText variant="label">Rol</AppText>
            <View style={styles.chips}>
              {ALL_ROLES.map((r) => (
                <Chip key={r} testID={`user-form-role-${r}`} label={ROLE_LABELS[r]} selected={f.value === r} onPress={() => f.onChange(r)} />
              ))}
            </View>
          </View>
        )}
      />
      <Button testID="user-form-submit" label="Crear usuario" icon={UserPlus} loading={isSubmitting} onPress={submit} />
    </Card>
  );
}

function UserRow({ user, isSelf }: { user: Member; isSelf: boolean }) {
  const [open, setOpen] = useState(false);
  const update = useUpdateUser();

  const change = async (input: { role?: Role; isActive?: boolean }, message: string) => {
    try {
      await update.mutateAsync({ id: user.id, ...input });
      toast.success(message);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card testID={`user-row-${user.email}`} style={!user.isActive && styles.inactive}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${user.fullName}, ${ROLE_LABELS[user.role]}. ${open ? 'Ocultar' : 'Mostrar'} opciones`}
        onPress={() => setOpen((o) => !o)}
        style={styles.rowHeader}
      >
        <View style={styles.avatar}>
          <AppText variant="bodyStrong" color="secondaryStrong">
            {user.fullName
              .split(' ')
              .slice(0, 2)
              .map((p) => p[0])
              .join('')}
          </AppText>
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">
            {user.fullName}
            {isSelf ? ' (tú)' : ''}
          </AppText>
          <AppText variant="caption">
            {ROLE_LABELS[user.role]} · {user.email} · {user.rut}
          </AppText>
          {user.students && user.students.length > 0 && (
            <AppText variant="caption">Apoderado de: {user.students.map((s) => `${s.fullName} (${s.course})`).join(', ')}</AppText>
          )}
        </View>
        {!user.isActive && (
          <View style={styles.badge}>
            <AppText variant="caption" color="dangerStrong">
              Inactivo
            </AppText>
          </View>
        )}
        {open ? (
          <ChevronUp size={18} color={colors.textSecondary} strokeWidth={1.75} />
        ) : (
          <ChevronDown size={18} color={colors.textSecondary} strokeWidth={1.75} />
        )}
      </Pressable>
      {open && (
        <View style={styles.rowPanel}>
          <AppText variant="label">Cambiar rol</AppText>
          <View style={styles.chips}>
            {ALL_ROLES.map((r) => (
              <Chip
                key={r}
                testID={`user-role-${user.email}-${r}`}
                label={ROLE_LABELS[r]}
                selected={user.role === r}
                onPress={() => (isSelf || r === user.role ? undefined : void change({ role: r }, `Rol actualizado a ${ROLE_LABELS[r]}`))}
              />
            ))}
          </View>
          <View style={styles.switchRow}>
            <AppText variant="bodyStrong">Cuenta activa</AppText>
            <Switch
              testID={`user-active-${user.email}`}
              accessibilityLabel={`Cuenta activa de ${user.fullName}`}
              value={user.isActive}
              disabled={isSelf || update.isPending}
              onValueChange={(isActive) => void change({ isActive }, isActive ? 'Usuario activado' : 'Usuario desactivado')}
              trackColor={{ false: colors.border, true: colors.success }}
              thumbColor={colors.surface}
            />
          </View>
          {isSelf && <AppText variant="caption">No puedes cambiar tu propio rol ni desactivar tu cuenta.</AppText>}
          {!isSelf && user.isActive && (
            <Button
              testID={`user-invite-${user.email}`}
              label="Enviar enlace para crear o cambiar contraseña"
              icon={MailPlus}
              variant="ghost"
              compact
              onPress={async () => {
                try {
                  await usersApi.invite(user.id);
                  toast.success(`Enviamos el enlace a ${user.email}`);
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            />
          )}
        </View>
      )}
    </Card>
  );
}

export function UsersScreen() {
  const me = useSession((s) => s.user);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | undefined>();
  const [creating, setCreating] = useState(false);
  const users = useUsers({ q: q.trim() || undefined, role, pageSize: 100 }, isAdmin(me?.role));

  if (!isAdmin(me?.role)) return <Redirect href="/" />;

  return (
    <Screen
      testID="users-screen"
      title="Usuarios"
      subtitle={users.data ? `${users.data.total} personas registradas` : undefined}
      headerRight={!creating && <Button testID="users-new" label="Nuevo" icon={UserPlus} compact onPress={() => setCreating(true)} />}
    >
      <View style={styles.chips}>
        <Button testID="users-import" label="Importar planilla" icon={FileSpreadsheet} variant="secondary" compact onPress={() => router.push('/users/import')} />
        <Button testID="users-audit" label="Bitácora" icon={History} variant="ghost" compact onPress={() => router.push('/users/audit')} />
      </View>
      {creating && <CreateUserForm onDone={() => setCreating(false)} />}
      <TextField testID="users-search" icon={Search} placeholder="Buscar por nombre, RUT, correo o estudiante" value={q} onChangeText={setQ} autoCapitalize="none" />
      <View style={styles.chips}>
        <Chip testID="users-role-all" label="Todos" selected={!role} onPress={() => setRole(undefined)} />
        {ALL_ROLES.map((r) => (
          <Chip key={r} testID={`users-role-${r}`} label={ROLE_LABELS[r]} selected={role === r} onPress={() => setRole(role === r ? undefined : r)} />
        ))}
      </View>
      {users.isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={64} rounded={radius.lg} />
          ))}
        </View>
      ) : users.data?.items.length ? (
        <View style={styles.list} testID="users-list">
          {users.data.items.map((u) => (
            <UserRow key={u.id} user={u} isSelf={u.id === me?.id} />
          ))}
        </View>
      ) : (
        <EmptyState icon={UsersRound} title="Sin resultados" message="No encontramos usuarios con esos criterios." />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 140 },
  form: { gap: spacing.md },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  roles: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  list: { gap: spacing.sm },
  inactive: { opacity: 0.75 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.secondarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.dangerSoft },
  rowPanel: { gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
