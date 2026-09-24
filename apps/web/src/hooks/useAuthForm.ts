import { useState, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';

interface UseAuthFormProps<T> {
  onSubmit: (data: T) => Promise<void>;
  initialData: T;
  onSuccessRedirect?: () => void;
}

interface UseAuthFormReturn<T> {
  formData: T;
  error: string | null;
  isLoading: boolean;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function useAuthForm<T extends Record<string, unknown>>({
  onSubmit,
  initialData,
  onSuccessRedirect,
}: UseAuthFormProps<T>): UseAuthFormReturn<T> {
  const [formData, setFormData] = useState<T>(initialData);
  const [error, setError] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);

  const { mutate, isPending } = useMutation({
    mutationFn: (data: T) => onSubmit(data),
    onSuccess: () => {
      onSuccessRedirect?.();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : String(err));
    },
    onSettled: () => { submitInFlightRef.current = false; },
  });

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitInFlightRef.current) return;
    setError(null);
    // Prefer DOM values so iOS/Android autofill (which may skip React onChange) still submits.
    const data = { ...formData };
    if (e.currentTarget instanceof HTMLFormElement) {
      const fd = new FormData(e.currentTarget);
      for (const key of Object.keys(formData) as Array<keyof T>) {
        const value = fd.get(String(key));
        if (typeof value === 'string') {
          data[key] = value as T[keyof T];
        }
      }
      setFormData(data);
    }
    submitInFlightRef.current = true;
    mutate(data);
  }, [mutate, formData]);

  return {
    formData,
    error,
    isLoading: isPending,
    handleChange,
    handleSubmit,
  };
}
