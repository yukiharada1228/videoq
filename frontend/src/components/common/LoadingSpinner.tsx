import {
  ProgressIndicator,
  ProgressIndicatorSpinner,
} from '@/components/ui/progress-indicator';

interface LoadingSpinnerProps {
  message?: string;
}

export function LoadingSpinner({ message }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center justify-center py-8">
      <ProgressIndicator type="stacked" aria-label={message ?? 'Loading'}>
        <ProgressIndicatorSpinner />
        <span className="text-std-16N-170 text-solid-gray-700">
          {message ?? 'Loading'}
        </span>
      </ProgressIndicator>
    </div>
  );
}
