import { LoadingSpinner } from './LoadingSpinner';
import { MessageAlert } from './MessageAlert';

interface LoadingStateProps {
  isLoading: boolean;
  error: string | null;
  children: React.ReactNode;
  loadingMessage?: string;
  errorMessage?: string;
}

/**
 * Component to manage loading and error states in a unified way
 */
export function LoadingState({
  isLoading,
  error,
  children,
  loadingMessage,
  errorMessage,
}: LoadingStateProps) {
  if (isLoading) {
    return <LoadingSpinner message={loadingMessage} />;
  }

  if (error) {
    return (
      <MessageAlert
        type="error"
        message={errorMessage || error}
      />
    );
  }

  return <>{children}</>;
}
