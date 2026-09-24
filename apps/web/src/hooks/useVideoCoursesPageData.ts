import { useQueryClient, useMutation } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';

export function useCreateVideoCourseMutation() {
  const queryClient = useQueryClient();

  return useMutation(trpc.courses.create.mutationOptions({
    onSuccess: async () => {
      await queryClient.invalidateQueries(trpc.courses.list.pathFilter());
    },
  }));
}

export function useReorderVideoCoursesMutation() {
  const queryClient = useQueryClient();

  return useMutation(trpc.courses.reorder.mutationOptions({
    onSuccess: async () => {
      await queryClient.invalidateQueries(trpc.courses.list.pathFilter());
    },
  }));
}
