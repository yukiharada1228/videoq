interface ErrorMessageProps {
  message: string | null;
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  if (!message) return null;
  
  return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">
      {message}
    </div>
  );
}

