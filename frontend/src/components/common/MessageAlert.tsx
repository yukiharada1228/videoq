interface MessageAlertProps {
  message: string;
  type: 'error' | 'success';
}

export function MessageAlert({ message, type }: MessageAlertProps) {
  const styles = type === 'error'
    ? 'bg-red-50 border border-red-200 text-red-600'
    : 'bg-green-50 border border-green-200 text-green-700';

  return (
    <div className={`rounded-xl p-3 text-sm ${styles}`}>
      {message}
    </div>
  );
}

