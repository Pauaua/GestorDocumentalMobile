import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { catalogApi, coursesApi, documentsApi } from '@/lib/api/endpoints';
import { useSession } from '@/lib/session/store';
import { isManagement } from '@/lib/permissions';
import type { DocumentFilters, DocumentInput, DocumentStatus } from '@/lib/types';

export const documentKeys = {
  all: ['documents'] as const,
  list: (filters: DocumentFilters) => ['documents', 'list', filters] as const,
  detail: (id: string) => ['documents', 'detail', id] as const,
  downloads: (id: string) => ['documents', 'downloads', id] as const,
  receipts: (id: string) => ['documents', 'receipts', id] as const,
  stats: ['documents', 'stats'] as const,
};

export function useDocumentList(filters: DocumentFilters, pageSize = 15) {
  return useInfiniteQuery({
    queryKey: documentKeys.list(filters),
    queryFn: ({ pageParam }) => documentsApi.list(filters, pageParam, pageSize),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
}

export function useDocument(id: string) {
  return useQuery({ queryKey: documentKeys.detail(id), queryFn: () => documentsApi.get(id), enabled: !!id });
}

export function useDocumentDownloads(id: string, enabled: boolean) {
  return useQuery({ queryKey: documentKeys.downloads(id), queryFn: () => documentsApi.downloads(id), enabled });
}

export function useDocumentReceipts(id: string, enabled: boolean) {
  return useQuery({ queryKey: documentKeys.receipts(id), queryFn: () => documentsApi.receipts(id), enabled });
}

export function useAcknowledgeDocument(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => documentsApi.acknowledge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: documentKeys.detail(id) }),
  });
}

export function useDocumentStats() {
  const role = useSession((s) => s.user?.role);
  return useQuery({ queryKey: documentKeys.stats, queryFn: documentsApi.stats, enabled: isManagement(role) });
}

/** Cursos del colegio (para dirigir documentos a sus apoderados). */
export function useCourses() {
  const role = useSession((s) => s.user?.role);
  return useQuery({ queryKey: ['courses'], queryFn: coursesApi.list, enabled: isManagement(role) });
}

export function useDocumentTypes() {
  return useQuery({ queryKey: ['document-types'], queryFn: catalogApi.documentTypes, staleTime: Infinity });
}

export function useUpdateDocument(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<DocumentInput> & { status?: DocumentStatus }) => documentsApi.update(id, input),
    onSuccess: (doc) => {
      qc.setQueryData(documentKeys.detail(id), doc);
      void qc.invalidateQueries({ queryKey: documentKeys.all });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => documentsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: documentKeys.all }),
  });
}
