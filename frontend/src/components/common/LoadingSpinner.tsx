interface LoadingSpinnerProps {
  message?: string;
}

export function LoadingSpinner({ message }: LoadingSpinnerProps) {
  return (
    <div className="flex justify-center items-center py-8">
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center rounded-2xl border border-[#d9e6db] bg-white/80 px-6 py-5 shadow-[0_12px_32px_-8px_rgba(25,28,25,0.10)]"
      >
        <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#f2f4ef]">
          <div className="absolute inset-1 rounded-full border border-[#dfe6df]" />
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#becabc] border-t-[#00652c]" />
          <div className="absolute h-2 w-2 rounded-full bg-[#00652c]" />
        </div>
        {message ? (
          <p className="text-sm font-medium text-[#3f493f]">{message}</p>
        ) : (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6f7a6e]">
            Loading
          </p>
        )}
      </div>
    </div>
  );
}
