import { initI18n } from '@/i18n/config';
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
 * ローディング状態とエラー状態を統一管理するコンポーネント
 */
export function LoadingState({
  isLoading,
  error,
  children,
  loadingMessage,
  errorMessage,
  fullScreen = false,
}: LoadingStateProps) {
  const i18n = initI18n();
  const resolvedLoadingMessage = loadingMessage ?? i18n.t('common.loading');

  if (isLoading) {
    return (
      <div className={fullScreen ? "flex min-h-screen items-center justify-center" : "flex justify-center items-center h-64"}>
        <LoadingSpinner message={resolvedLoadingMessage} fullScreen={fullScreen} />
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
