interface InlineSpinnerProps {
  className?: string;
  color?: 'blue' | 'red';
}

/**
 * Small spinner used inline
 * Primarily used inside buttons
 */
export function InlineSpinner({ className, color = 'blue' }: InlineSpinnerProps) {
  const colorClasses =
    color === 'red'
      ? 'border-red-200 border-t-error-1'
      : 'border-solid-gray-300 border-t-blue-900';

  return (
    <div
      className={`h-4 w-4 animate-spin rounded-full border-2 ${colorClasses} ${className || ''}`}
    />
  );
}
