import { initI18n } from '@/i18n/config';

interface LoadingSpinnerProps {
  message?: string;
  fullScreen?: boolean;
}

const i18n = initI18n();

export function LoadingSpinner({
  message = i18n.t('common.loading'),
  fullScreen = true,
}: LoadingSpinnerProps) {
  if (fullScreen) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
          <p className="text-gray-600">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
    </div>
  );
}

