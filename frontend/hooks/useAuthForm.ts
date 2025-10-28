import { useFormState } from './useFormState';

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

export function useAuthForm<T extends Record<string, any>>({
  onSubmit,
  initialData,
  onSuccessRedirect,
}: UseAuthFormProps<T>): UseAuthFormReturn<T> {
  const { formData, isLoading, error, updateField, handleSubmit, setError } = useFormState({
    initialData,
    onSubmit,
    onSuccess: onSuccessRedirect,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateField(e.target.name as keyof T, e.target.value as T[keyof T]);
  };

  return {
    formData,
    error,
    loading: isLoading,
    setError,
    handleChange,
    handleSubmit,
  };
}

