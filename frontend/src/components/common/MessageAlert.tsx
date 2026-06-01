interface MessageAlertProps {
  message: string;
  type: 'error' | 'success' | 'warning';
}

export function MessageAlert({ message, type }: MessageAlertProps) {
  const styles = {
    error: 'bg-red-50 border border-red-200 text-red-600',
    success: 'bg-green-50 border border-green-200 text-green-700',
    warning: 'bg-amber-50 border border-amber-200 text-amber-700',
  }[type];

  return (
    <div className={`rounded-xl p-3 text-sm ${styles}`}>
      {message}
    </div>
  );
}
