import { useQueryClient } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { CircleAlert, CircleCheck, FileDown, FileSpreadsheet, Upload } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BackButton } from '@/components/back-button';
import { FilePicker } from '@/components/file-picker';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { toast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/client';
import { importsApi } from '@/lib/api/endpoints';
import { readPickedText, saveTextFile } from '@/lib/files/text-files';
import type { PickedFile } from '@/lib/files/types';
import { isAdmin } from '@/lib/permissions';
import { useSession } from '@/lib/session/store';
import type { ImportKind, ImportResult } from '@/lib/types';
import { colors, radius, spacing } from '@/theme';

// Excel en Windows entrega los CSV como application/vnd.ms-excel.
const CSV_TYPES = ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'text/plain'];
const MAX_BYTES = 2 * 1024 * 1024;

const KINDS: Record<ImportKind, { label: string; help: string; template: string }> = {
  people: {
    label: 'Personas',
    help: 'Docentes, equipo directivo y apoderados. Columnas: nombre, rut, correo, rol (docente, equipo directivo o apoderado) y teléfono (opcional).',
    template: 'plantilla-personas.csv',
  },
  students: {
    label: 'Estudiantes y apoderados',
    help: 'Una fila por estudiante con su apoderado(a). Se crean los cursos que falten y se vincula a cada apoderado con su estudiante.',
    template: 'plantilla-estudiantes.csv',
  },
};

/** "1 cuenta nueva" / "3 cuentas nuevas". */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Summary({ result }: { result: ImportResult }) {
  const s = result.summary;
  const facts = [
    `${s.valid} de ${count(s.rows, 'fila válida', 'filas válidas')}`,
    s.errors ? `${s.errors} con errores` : null,
    s.accountsCreated ? count(s.accountsCreated, 'cuenta nueva', 'cuentas nuevas') : null,
    s.addedToSchool ? `${s.addedToSchool} ${s.addedToSchool === 1 ? 'se agrega' : 'se agregan'} al colegio` : null,
    s.invitations ? count(s.invitations, 'invitación por correo', 'invitaciones por correo') : null,
    s.studentsCreated ? count(s.studentsCreated, 'estudiante nuevo', 'estudiantes nuevos') : null,
    s.coursesCreated ? count(s.coursesCreated, 'curso nuevo', 'cursos nuevos') : null,
  ].filter(Boolean);
  return (
    <AppText variant="bodyStrong" testID="import-summary">
      {facts.join(' · ')}
    </AppText>
  );
}

export function ImportScreen() {
  const role = useSession((s) => s.user?.role);
  const qc = useQueryClient();
  const [kind, setKind] = useState<ImportKind>('people');
  const [invite, setInvite] = useState(true);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | 'template' | null>(null);

  if (!isAdmin(role)) return <Redirect href="/" />;

  const reset = () => {
    setFile(null);
    setCsv(null);
    setPreview(null);
  };

  const runPreview = async (text: string, withInvite: boolean) => {
    setBusy('preview');
    try {
      setPreview(await importsApi.run(kind, text, { dryRun: true, invite: withInvite }));
    } catch (err) {
      setPreview(null);
      toast.error(errorMessage(err, 'No pudimos revisar el archivo'));
    } finally {
      setBusy(null);
    }
  };

  const onPick = async (picked: PickedFile) => {
    if (picked.size > MAX_BYTES) {
      toast.error('El archivo supera 2 MB. Divídelo en partes.');
      return;
    }
    try {
      const text = await readPickedText(picked);
      setFile(picked);
      setCsv(text);
      await runPreview(text, invite);
    } catch (err) {
      toast.error(errorMessage(err, 'No pudimos leer el archivo'));
    }
  };

  const commit = async () => {
    if (!csv) return;
    setBusy('commit');
    try {
      const done = await importsApi.run(kind, csv, { dryRun: false, invite });
      toast.success(`Importación lista: ${done.summary.valid} filas`);
      await qc.invalidateQueries();
      reset();
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo importar. No se guardó ningún cambio.'));
    } finally {
      setBusy(null);
    }
  };

  const downloadTemplate = async () => {
    setBusy('template');
    try {
      await saveTextFile(KINDS[kind].template, await importsApi.template(kind), 'text/csv');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const errors = preview?.rows.filter((r) => r.status === 'error') ?? [];
  const oks = preview?.rows.filter((r) => r.status === 'ok') ?? [];

  return (
    <Screen testID="import-screen" title="Importar desde planilla" subtitle="Excel → Archivo → Guardar como → CSV">
      <BackButton />
      <Card style={styles.section}>
        <AppText variant="subtitle">1. ¿Qué quieres importar?</AppText>
        <View style={styles.chips}>
          {(Object.keys(KINDS) as ImportKind[]).map((k) => (
            <Chip
              key={k}
              testID={`import-kind-${k}`}
              label={KINDS[k].label}
              selected={kind === k}
              onPress={() => {
                setKind(k);
                reset();
              }}
            />
          ))}
        </View>
        <AppText variant="caption">{KINDS[kind].help}</AppText>
        <Button
          testID="import-template"
          label="Descargar plantilla"
          icon={FileDown}
          variant="secondary"
          compact
          loading={busy === 'template'}
          onPress={() => void downloadTemplate()}
        />
        <Chip
          testID="import-invite"
          label="Enviar invitación por correo a las cuentas nuevas"
          selected={invite}
          onPress={() => {
            const next = !invite;
            setInvite(next);
            if (csv) void runPreview(csv, next);
          }}
        />
      </Card>

      <Card style={styles.section}>
        <AppText variant="subtitle">2. Elige el archivo y revisa la vista previa</AppText>
        <FilePicker
          file={file}
          onPick={(f) => void onPick(f)}
          disabled={!!busy}
          types={CSV_TYPES}
          extensions={['.csv', '.txt']}
          inputTestID="import-file-input"
          inputLabel="Planilla CSV"
        />
        {busy === 'preview' && <AppText variant="caption">Revisando el archivo…</AppText>}
        {preview && (
          <View style={styles.preview} testID="import-preview">
            <Summary result={preview} />
            {errors.length > 0 && (
              <View style={styles.block}>
                <AppText variant="label" color="dangerStrong">
                  Filas con errores (no se importarán)
                </AppText>
                {errors.slice(0, 100).map((r) => (
                  <View key={r.line} style={styles.line} testID={`import-error-${r.line}`}>
                    <CircleAlert size={16} color={colors.dangerStrong} strokeWidth={1.75} />
                    <AppText variant="caption" style={styles.flex}>
                      Fila {r.line}: {r.errors.join(' · ')}
                    </AppText>
                  </View>
                ))}
              </View>
            )}
            {oks.length > 0 && (
              <View style={styles.block}>
                <AppText variant="label">Qué se hará</AppText>
                {oks.slice(0, 50).map((r) => (
                  <View key={r.line} style={styles.line}>
                    <CircleCheck size={16} color={colors.successStrong} strokeWidth={1.75} />
                    <AppText variant="caption" style={styles.flex}>
                      Fila {r.line}: {r.actions.join(' · ')}
                    </AppText>
                  </View>
                ))}
                {oks.length > 50 && <AppText variant="caption">… y {oks.length - 50} filas más.</AppText>}
              </View>
            )}
          </View>
        )}
      </Card>

      {preview && preview.summary.valid > 0 && (
        <Card style={styles.section}>
          <AppText variant="subtitle">3. Confirmar</AppText>
          <AppText variant="caption">
            Se importan solo las filas válidas, todas juntas: si algo falla, no se guarda ningún cambio.
          </AppText>
          <Button
            testID="import-commit"
            label={`Importar ${count(preview.summary.valid, 'fila', 'filas')}`}
            icon={Upload}
            loading={busy === 'commit'}
            disabled={busy !== null && busy !== 'commit'}
            onPress={() => void commit()}
          />
        </Card>
      )}

      {!preview && (
        <View style={styles.tip}>
          <FileSpreadsheet size={16} color={colors.textSecondary} strokeWidth={1.75} />
          <AppText variant="caption" style={styles.flex}>
            Puedes partir de lo que exportas de tu sistema académico: basta con que las columnas tengan los nombres de la
            plantilla (mayúsculas y tildes no importan).
          </AppText>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  preview: { gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.background },
  block: { gap: spacing.xs },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, paddingHorizontal: spacing.xs },
});
