import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export function useRequestPasswordResetMutation() {
  return useMutation({
    mutationFn: async (email: string) => await apiClient.requestPasswordReset({ email }),
  });
}

export function useConfirmPasswordResetMutation() {
  return useMutation({
    mutationFn: async (params: { token: string; newPassword: string }) =>
      await apiClient.confirmPasswordReset({
        token: params.token,
        new_password: params.newPassword,
      }),
  });
}
