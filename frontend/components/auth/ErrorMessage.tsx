interface ErrorMessageProps {
  message: string;
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  if (!message) return null;
  
  return (
    <div className="rounded-md bg-red-50 p-4 text-sm text-red-600">
      {message}
    </div>
  );
}

