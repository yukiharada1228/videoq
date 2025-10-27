import { useState } from 'react';

interface UseAuthFormProps<T> {
  onSubmit: (data: T) => Promise<void>;
  initialData: T;
  onSuccessRedirect?: () => void;
}

interface UseAuthFormReturn<T> {
  formData: T;
  error: string;
  loading: boolean;
  setError: (error: string) => void;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
}

export function useAuthForm<T extends Record<string, any>>({
  onSubmit,
  initialData,
  onSuccessRedirect,
}: UseAuthFormProps<T>): UseAuthFormReturn<T> {
  const [formData, setFormData] = useState<T>(initialData);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onSubmit(formData);
      if (onSuccessRedirect) {
        onSuccessRedirect();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return {
    formData,
    error,
    loading,
    setError,
    handleChange,
    handleSubmit,
  };
}

