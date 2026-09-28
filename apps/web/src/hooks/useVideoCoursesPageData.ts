import { useQueryClient, useMutation } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { refreshQuery } from '@/lib/cacheInvalidation';

export function useCreateVideoCourseMutation() {
  const queryClient = useQueryClient();

  return useMutation(trpc.courses.create.mutationOptions({
    onSuccess: () => refreshQuery(queryClient, trpc.courses.list.pathFilter()),
  }));
}

export function useReorderVideoCoursesMutation() {
  const queryClient = useQueryClient();

  return useMutation(trpc.courses.reorder.mutationOptions({
    onSuccess: () => refreshQuery(queryClient, trpc.courses.list.pathFilter()),
  }));
}
