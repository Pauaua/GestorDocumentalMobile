import { useQuery } from '@tanstack/react-query';
import { documentsApi } from '@/lib/api/endpoints';
import type { DocumentItem } from '@/lib/types';

/** URL firmada "inline" para la vista previa (dura 5 min: se renueva antes de expirar). */
export function usePreviewUrl(doc: DocumentItem, enabled: boolean) {
  return useQuery({
    queryKey: ['documents', 'preview', doc.id],
    queryFn: () => documentsApi.downloadUrl(doc.id, 'inline'),
    enabled,
    staleTime: 4 * 60 * 1000,
    gcTime: 4 * 60 * 1000,
  });
}
