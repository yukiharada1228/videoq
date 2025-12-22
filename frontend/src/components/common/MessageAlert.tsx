interface MessageAlertProps {
  message: string;
  type: 'error' | 'success';
}

export function MessageAlert({ message, type }: MessageAlertProps) {
  const styles = type === 'error' 
    ? 'bg-red-50 text-red-800' 
    : 'bg-green-50 text-green-800';
  
  return (
    <div className={`rounded-md p-4 text-sm ${styles}`}>
      {message}
    </div>
  );
}

