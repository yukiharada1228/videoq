import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';

interface UseAuthFormProps<T> {
  onSubmit: (data: T) => Promise<void>;
  initialData: T;
  onSuccessRedirect?: () => void;
}

interface UseAuthFormReturn<T> {
  formData: T;
  error: string | null;
  loading: boolean;
  setError: (error: string | null) => void;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}

export function useAuthForm<T extends Record<string, unknown>>({
  onSubmit,
  initialData,
  onSuccessRedirect,
}: UseAuthFormProps<T>): UseAuthFormReturn<T> {
  const [formData, setFormData] = useState<T>(initialData);
  const [error, setError] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: async (data: T) => {
      await onSubmit(data);
      return data;
    },
    onSuccess: () => {
      onSuccessRedirect?.();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  const updateField = useCallback((field: keyof T, value: T[keyof T]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateField(e.target.name as keyof T, e.target.value as T[keyof T]);
  }, [updateField]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    await submitMutation.mutateAsync(formData);
  }, [submitMutation, formData]);

  return {
    formData,
    error,
    loading: submitMutation.isPending,
    setError,
    handleChange,
    handleSubmit,
  };
}
