import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi, type CreateUserInput, type UserListParams } from '@/lib/api/endpoints';
import type { Role } from '@/lib/types';

export function useUsers(params: UserListParams, enabled = true) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => usersApi.list(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => usersApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; role?: Role; isActive?: boolean }) => usersApi.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
