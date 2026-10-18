import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronRight, FileJson, GraduationCap, LogOut, Mail, MailCheck, Phone, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { toast } from '@/components/ui/toast';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks/use-notifications';
import { errorMessage } from '@/lib/api/client';
import { Screen } from '@/components/ui/screen';
import { authApi, privacyApi } from '@/lib/api/endpoints';
import { saveTextFile } from '@/lib/files/text-files';
import { ROLE_LABELS } from '@/lib/permissions';
import { signOut, switchSchool } from '@/lib/session/actions';
import { useSession } from '@/lib/session/store';
import { colors, radius, spacing } from '@/theme';

function InfoRow({ icon: Icon, label, value, testID }: { icon: LucideIcon; label: string; value: string; testID?: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Icon size={18} color={colors.primaryStrong} strokeWidth={1.6} />
      </View>
      <View style={styles.flex}>
        <AppText variant="caption">{label}</AppText>
        <AppText variant="bodyStrong" testID={testID}>
          {value}
        </AppText>
      </View>
    </View>
  );
}

export function ProfileScreen() {
  const user = useSession((s) => s.user)!;
  const [leaving, setLeaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await privacyApi.export();
      await saveTextFile(`mis-datos-rtlco-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
    } catch (err) {
      toast.error(errorMessage(err, 'No pudimos preparar tus datos'));
    } finally {
      setExporting(false);
    }
  };
  // /auth/me incluye los estudiantes asociados al apoderado.
  const me = useQuery({ queryKey: ['me'], queryFn: authApi.me });
  const students = me.data?.students ?? [];
  const schools = me.data?.schools ?? [];
  const prefs = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();

  const initials = user.fullName
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('');

  return (
    <Screen testID="profile-screen" title="Mi perfil">
      <Card style={styles.hero}>
        <View style={styles.avatar}>
          <AppText variant="title" color="secondaryStrong">
            {initials}
          </AppText>
        </View>
        <View style={styles.flex}>
          <AppText variant="subtitle" testID="profile-name">
            {user.fullName}
          </AppText>
          <AppText variant="caption" testID="profile-role">
            {ROLE_LABELS[user.role]} · {user.school.name}
          </AppText>
        </View>
      </Card>

      <Card style={styles.info}>
        <InfoRow icon={Mail} label="Correo" value={user.email} testID="profile-email" />
        <InfoRow icon={ShieldCheck} label="RUT" value={user.rut} testID="profile-rut" />
        <InfoRow icon={Phone} label="Teléfono" value={user.phone ?? 'Sin registrar'} />
        {students.length > 0 && (
          <InfoRow
            icon={GraduationCap}
            label="Estudiantes a cargo"
            value={students.map((s) => `${s.fullName} (${s.course})`).join('\n')}
            testID="profile-students"
          />
        )}
      </Card>

      <Card style={styles.info} testID="profile-notifications">
        <AppText variant="subtitle">Avisos</AppText>
        <View style={styles.infoRow}>
          <View style={styles.infoIcon}>
            <MailCheck size={18} color={colors.primaryStrong} strokeWidth={1.6} />
          </View>
          <View style={styles.flex}>
            <AppText variant="caption">
              Siempre verás los avisos en la app. Además, puedes recibir un correo cuando el colegio publique un documento
              para ti.
            </AppText>
          </View>
        </View>
        {prefs.data && (
          <Chip
            testID="profile-email-notifications"
            label="Recibir avisos por correo"
            selected={prefs.data.emailNotifications}
            onPress={async () => {
              try {
                await updatePrefs.mutateAsync({ emailNotifications: !prefs.data.emailNotifications });
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          />
        )}
      </Card>

      <Card style={styles.info} testID="profile-privacy">
        <AppText variant="subtitle">Tus datos</AppText>
        <AppText variant="caption">
          Puedes descargar en un archivo todo lo que RTLCO guarda sobre ti. Para corregir o eliminar datos, escribe a la
          dirección de tu colegio.
        </AppText>
        <Button testID="profile-export" label="Descargar mis datos" icon={FileJson} variant="secondary" compact loading={exporting} onPress={() => void exportData()} />
      </Card>

      {schools.length > 1 && (
        <Card style={styles.info} testID="profile-schools">
          <AppText variant="subtitle">Mis colegios</AppText>
          {schools.map((s) => {
            const current = s.id === user.school.id;
            return (
              <Pressable
                key={s.id}
                testID={`profile-school-${s.slug}`}
                accessibilityRole="button"
                accessibilityState={{ selected: current }}
                disabled={current}
                onPress={() => void switchSchool(s.slug)}
                style={({ pressed }) => [styles.infoRow, pressed && styles.pressed]}
              >
                <View style={styles.infoIcon}>
                  <Building2 size={18} color={colors.primaryStrong} strokeWidth={1.6} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{s.name}</AppText>
                  <AppText variant="caption">{current ? `${ROLE_LABELS[s.role]} · Colegio actual` : ROLE_LABELS[s.role]}</AppText>
                </View>
                {!current && <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} />}
              </Pressable>
            );
          })}
        </Card>
      )}

      <Button
        testID="profile-logout"
        label="Cerrar sesión"
        icon={LogOut}
        variant="danger"
        loading={leaving}
        onPress={async () => {
          setLeaving(true);
          await signOut();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.secondarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { gap: spacing.md },
  pressed: { opacity: 0.6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
