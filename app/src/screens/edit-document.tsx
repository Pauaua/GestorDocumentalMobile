import { router } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { BackButton } from '@/components/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useDocument, useUpdateDocument } from '@/hooks/use-documents';
import { errorMessage } from '@/lib/api/client';
import { radius } from '@/theme';
import { DocumentForm, type DocumentFormSubmit } from './document-form';

export function EditDocumentScreen({ id }: { id: string }) {
  const { data: doc, isLoading } = useDocument(id);
  const update = useUpdateDocument(id);

  if (isLoading) {
    return (
      <Screen>
        <BackButton />
        <Skeleton height={320} rounded={radius.lg} />
      </Screen>
    );
  }

  if (!doc || !doc.permissions.canEdit) {
    return (
      <Screen testID="edit-screen">
        <BackButton />
        <EmptyState
          testID="edit-forbidden"
          icon={Lock}
          title="No puedes editar este documento"
          message="Solo la dirección, el sostenedor o quien lo subió pueden modificarlo."
        />
      </Screen>
    );
  }

  const onSubmit = async ({ input, status }: DocumentFormSubmit) => {
    try {
      await update.mutateAsync({ ...input, status });
      toast.success('Cambios guardados');
      router.back();
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudieron guardar los cambios'));
    }
  };

  return (
    <Screen testID="edit-screen" title="Editar documento" subtitle={doc.fileName} header={undefined}>
      <BackButton label="Cancelar" />
      <DocumentForm
        mode="edit"
        onSubmit={onSubmit}
        initial={{
          title: doc.title,
          documentTypeId: doc.documentType.id,
          documentDate: doc.documentDate,
          folioNumber: doc.folioNumber ?? '',
          description: doc.description ?? '',
          visibleRoles: doc.visibleRoles ?? [],
          recipients: doc.recipients ?? [],
          status: doc.status,
          requiresAcknowledgement: doc.requiresAcknowledgement,
          courseIds: doc.courses?.map((c) => c.id) ?? [],
        }}
      />
    </Screen>
  );
}
