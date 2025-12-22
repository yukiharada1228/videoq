import { LoadingSpinner } from './LoadingSpinner';
import { MessageAlert } from './MessageAlert';

interface LoadingStateProps {
  isLoading: boolean;
  error: string | null;
  children: React.ReactNode;
  loadingMessage?: string;
  errorMessage?: string;
  fullScreen?: boolean;
}

/**
 * Component to manage loading and error states in a unified way
 */
export function LoadingState({
  isLoading,
  error,
  children,
  loadingMessage = 'Loading...',
  errorMessage,
  fullScreen = false,
}: LoadingStateProps) {
  if (isLoading) {
    return (
      <div className={fullScreen ? "flex min-h-screen items-center justify-center" : "flex justify-center items-center h-64"}>
        <LoadingSpinner message={loadingMessage} fullScreen={fullScreen} />
      </div>
    );
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
