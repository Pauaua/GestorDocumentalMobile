import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, BadgeCheck, Save, UploadCloud } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { AudiencePicker } from '@/components/audience-picker';
import { FilePicker } from '@/components/file-picker';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DateField } from '@/components/ui/date-field';
import { ProgressBar } from '@/components/ui/progress-bar';
import { TextField } from '@/components/ui/text-field';
import { useCourses, useDocumentTypes } from '@/hooks/use-documents';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '@/lib/config';
import type { PickedFile } from '@/lib/files/types';
import { todayIso } from '@/lib/format';
import type { DocumentInput, DocumentStatus, Role, UserSummary } from '@/lib/types';
import { colors, documentTypeStyle, spacing } from '@/theme';

const schema = z.object({
  title: z.string().trim().min(3, 'El título debe tener al menos 3 caracteres').max(200, 'Máximo 200 caracteres'),
  documentTypeId: z.number({ required_error: 'Elige el tipo de documento', invalid_type_error: 'Elige el tipo de documento' }),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elige la fecha del documento'),
  folioNumber: z.string().trim().max(50, 'Máximo 50 caracteres').optional(),
  description: z.string().trim().max(2000, 'Máximo 2000 caracteres').optional(),
});
type FormValues = z.infer<typeof schema>;

export interface DocumentFormSubmit {
  input: DocumentInput;
  file: PickedFile | null;
  status: DocumentStatus;
  recipients: UserSummary[];
}

interface DocumentFormProps {
  mode: 'create' | 'edit';
  initial?: Partial<FormValues> & {
    visibleRoles?: Role[];
    recipients?: UserSummary[];
    status?: DocumentStatus;
    requiresAcknowledgement?: boolean;
    courseIds?: string[];
  };
  onSubmit: (data: DocumentFormSubmit) => Promise<void>;
  progress?: number | null;
}

export function validateFile(file: PickedFile | null): string | undefined {
  if (!file) return 'Elige el archivo que quieres subir';
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimeType)) return 'Formato no permitido. Usa PDF, DOCX, JPG o PNG.';
  if (file.size > MAX_FILE_SIZE) return 'El archivo supera el máximo de 10 MB';
  if (file.size === 0) return 'El archivo está vacío';
  return undefined;
}

export function DocumentForm({ mode, initial, onSubmit, progress }: DocumentFormProps) {
  const { data: types = [] } = useDocumentTypes();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [visibleRoles, setVisibleRoles] = useState<Role[]>(initial?.visibleRoles ?? []);
  const [recipients, setRecipients] = useState<UserSummary[]>(initial?.recipients ?? []);
  const [status, setStatus] = useState<DocumentStatus>(initial?.status ?? 'VIGENTE');
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(initial?.requiresAcknowledgement ?? false);
  const [courseIds, setCourseIds] = useState<string[]>(initial?.courseIds ?? []);
  const { data: courses = [] } = useCourses();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title ?? '',
      documentTypeId: initial?.documentTypeId,
      documentDate: initial?.documentDate ?? todayIso(),
      folioNumber: initial?.folioNumber ?? '',
      description: initial?.description ?? '',
    },
  });

  const submit = handleSubmit(async (values) => {
    if (mode === 'create') {
      const err = validateFile(file);
      setFileError(err);
      if (err) return;
    }
    await onSubmit({
      file,
      status,
      recipients,
      input: {
        title: values.title,
        documentTypeId: values.documentTypeId,
        documentDate: values.documentDate,
        folioNumber: values.folioNumber || null,
        description: values.description || null,
        visibleRoles,
        recipientIds: recipients.map((r) => r.id),
        courseIds,
        requiresAcknowledgement,
      },
    });
  });

  const uploading = progress !== null && progress !== undefined;

  return (
    <View style={styles.container}>
      {mode === 'create' && (
        <Card style={styles.section}>
          <AppText variant="subtitle">1. Archivo</AppText>
          <FilePicker
            file={file}
            disabled={isSubmitting}
            error={fileError}
            onPick={(picked) => {
              setFile(picked);
              setFileError(validateFile(picked));
            }}
          />
        </Card>
      )}

      <Card style={styles.section}>
        <AppText variant="subtitle">{mode === 'create' ? '2. Datos del documento' : 'Datos del documento'}</AppText>
        <Controller
          control={control}
          name="title"
          render={({ field }) => (
            <TextField
              testID="document-form-title"
              label="Título"
              placeholder="Ej.: Citación a reunión de apoderados"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.title?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="documentTypeId"
          render={({ field }) => (
            <View style={styles.field}>
              <AppText variant="label">Tipo de documento</AppText>
              <View style={styles.chips}>
                {types.map((t) => {
                  const s = documentTypeStyle(t.code);
                  return (
                    <Chip
                      key={t.id}
                      testID={`document-form-type-${t.code}`}
                      label={t.name}
                      selected={field.value === t.id}
                      selectedBackground={s.background}
                      selectedForeground={s.foreground}
                      onPress={() => field.onChange(t.id)}
                    />
                  );
                })}
              </View>
              {errors.documentTypeId && (
                <AppText variant="caption" color="dangerStrong" testID="document-form-type-error">
                  {errors.documentTypeId.message}
                </AppText>
              )}
            </View>
          )}
        />

        <View style={styles.row}>
          <Controller
            control={control}
            name="documentDate"
            render={({ field }) => (
              <DateField
                testID="document-form-date"
                label="Fecha del documento"
                value={field.value}
                onChange={(v) => field.onChange(v ?? '')}
                error={errors.documentDate?.message}
              />
            )}
          />
          <View style={styles.folio}>
            <Controller
              control={control}
              name="folioNumber"
              render={({ field }) => (
                <TextField
                  testID="document-form-folio"
                  label="N° de folio (opcional)"
                  placeholder="Ej.: CIT-2026-030"
                  autoCapitalize="characters"
                  value={field.value}
                  onChangeText={field.onChange}
                  error={errors.folioNumber?.message}
                />
              )}
            />
          </View>
        </View>

        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <TextField
              testID="document-form-description"
              label="Descripción (opcional)"
              placeholder="Resumen breve del contenido"
              multiline
              value={field.value}
              onChangeText={field.onChange}
              error={errors.description?.message}
            />
          )}
        />

        {mode === 'edit' && (
          <View style={styles.field}>
            <AppText variant="label">Estado</AppText>
            <View style={styles.chips}>
              <Chip
                testID="document-form-status-VIGENTE"
                label="Vigente"
                selected={status === 'VIGENTE'}
                selectedBackground={colors.success}
                selectedForeground={colors.successStrong}
                onPress={() => setStatus('VIGENTE')}
              />
              <Chip
                testID="document-form-status-ARCHIVADO"
                label="Archivado"
                selected={status === 'ARCHIVADO'}
                selectedBackground={colors.warning}
                selectedForeground={colors.warningStrong}
                onPress={() => setStatus('ARCHIVADO')}
              />
            </View>
            {status === 'ARCHIVADO' && (
              <View style={styles.hint}>
                <Archive size={14} color={colors.warningStrong} strokeWidth={1.75} />
                <AppText variant="caption" color="warningStrong" style={styles.hintText}>
                  Los documentos archivados solo los ve el equipo directivo.
                </AppText>
              </View>
            )}
          </View>
        )}
      </Card>

      <Card style={styles.section}>
        <AppText variant="subtitle">{mode === 'create' ? '3. Visibilidad' : 'Visibilidad'}</AppText>
        <AudiencePicker
          visibleRoles={visibleRoles}
          onChangeRoles={setVisibleRoles}
          recipients={recipients}
          onChangeRecipients={setRecipients}
        />
        {courses.length > 0 && (
          <View style={styles.field}>
            <AppText variant="label">Apoderados de cursos (opcional)</AppText>
            <View style={styles.chips}>
              {courses.map((c) => (
                <Chip
                  key={c.id}
                  testID={`document-form-course-${c.name}`}
                  label={`${c.name} (${c.students})`}
                  selected={courseIds.includes(c.id)}
                  onPress={() => setCourseIds((ids) => (ids.includes(c.id) ? ids.filter((i) => i !== c.id) : [...ids, c.id]))}
                />
              ))}
            </View>
          </View>
        )}
        <View style={styles.field}>
          <Chip
            testID="document-form-requires-ack"
            label="Requiere confirmación de recepción"
            selected={requiresAcknowledgement}
            onPress={() => setRequiresAcknowledgement((v) => !v)}
          />
          <View style={styles.hint}>
            <BadgeCheck size={14} color={colors.textSecondary} strokeWidth={1.75} />
            <AppText variant="caption" style={styles.hintText}>
              Cada destinatario deberá confirmar que lo recibió; verás quién lo abrió y quién confirmó.
            </AppText>
          </View>
        </View>
      </Card>

      {uploading && (
        <View style={styles.progress}>
          <AppText variant="caption" testID="document-form-progress-label">
            {progress < 1 ? `Subiendo archivo… ${Math.round(progress * 100)}%` : 'Guardando datos…'}
          </AppText>
          <ProgressBar value={progress} testID="document-form-progress" />
        </View>
      )}

      <Button
        testID="document-form-submit"
        label={mode === 'create' ? 'Subir documento' : 'Guardar cambios'}
        icon={mode === 'create' ? UploadCloud : Save}
        loading={isSubmitting}
        onPress={submit}
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  section: { gap: spacing.md },
  field: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  folio: { flex: 1, minWidth: 180 },
  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xxs },
  hintText: { flex: 1 },
  progress: { gap: spacing.xs },
});
