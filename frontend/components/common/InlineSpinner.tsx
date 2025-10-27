interface InlineSpinnerProps {
  className?: string;
  color?: 'blue' | 'red';
}

/**
 * インラインで使用する小さなスピナー
 * 主にボタン内で使用
 */
export function InlineSpinner({ className, color = 'blue' }: InlineSpinnerProps) {
  const colorClasses = color === 'red' 
    ? 'border-red-300 border-t-red-600' 
    : 'border-gray-300 border-t-blue-600';
  
  return (
    <div className={`h-4 w-4 animate-spin rounded-full border-2 ${colorClasses} ${className || ''}`}></div>
  );
}

