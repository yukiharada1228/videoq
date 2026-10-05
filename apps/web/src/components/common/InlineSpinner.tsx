interface InlineSpinnerProps {
  className?: string;
  color?: 'current' | 'blue' | 'red';
}

/**
 * Small spinner used inline
 * Inherits button text colors, including danger and disabled states.
 */
export function InlineSpinner({ className, color = 'current' }: InlineSpinnerProps) {
  const colorClasses = {
    current: 'border-current/25 border-t-current',
    blue: 'border-key-100 border-t-key-900',
    red: 'border-red-200 border-t-error-1',
  }[color];

  // In forced colors, use a system-colored arc and keep the track transparent.
  return (
    <div
      className={`h-4 w-4 animate-spin rounded-full border-2 motion-reduce:animate-none forced-colors:forced-color-adjust-none forced-colors:border-transparent forced-colors:border-t-[CanvasText] ${colorClasses} ${className || ''}`}
    />
  );
}
