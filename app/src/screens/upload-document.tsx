import { useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Screen } from '@/components/ui/screen';
import { toast } from '@/components/ui/toast';
import { documentKeys } from '@/hooks/use-documents';
import { errorMessage } from '@/lib/api/client';
import { documentsApi } from '@/lib/api/endpoints';
import { uploadToPresignedUrl } from '@/lib/files/upload';
import { canUpload } from '@/lib/permissions';
import { useSession } from '@/lib/session/store';
import { DocumentForm, type DocumentFormSubmit } from './document-form';

/**
 * Flujo de subida:
 * 1. POST /documents/upload-url  → presigned PUT (valida tipo y tamaño en el servidor)
 * 2. PUT directo a S3 con barra de progreso
 * 3. POST /documents              → metadatos en PostgreSQL (RDS)
 */
export function UploadDocumentScreen() {
  const role = useSession((s) => s.user?.role);
  const qc = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const [formKey, setFormKey] = useState(0);

  if (!canUpload(role)) return <Redirect href="/" />;

  const onSubmit = async ({ file, input }: DocumentFormSubmit) => {
    if (!file) return;
    setProgress(0);
    try {
      const upload = await documentsApi.uploadUrl({ fileName: file.name, mimeType: file.mimeType, fileSize: file.size });
      await uploadToPresignedUrl(upload.uploadUrl, file, upload.headers, setProgress);
      const doc = await documentsApi.create({
        ...input,
        s3Key: upload.s3Key,
        fileName: file.name,
        mimeType: file.mimeType,
        fileSize: file.size,
      });
      await qc.invalidateQueries({ queryKey: documentKeys.all });
      toast.success('Documento subido y clasificado');
      setFormKey((k) => k + 1);
      router.push(`/documents/${doc.id}`);
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo subir el documento'));
    } finally {
      setProgress(null);
    }
  };

  return (
    <Screen testID="upload-screen" title="Subir documento" subtitle="Se guarda en el almacenamiento seguro del colegio">
      <DocumentForm key={formKey} mode="create" onSubmit={onSubmit} progress={progress} />
    </Screen>
  );
}
