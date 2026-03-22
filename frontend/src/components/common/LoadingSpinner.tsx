interface LoadingSpinnerProps {
  message?: string;
}

export function LoadingSpinner({ message }: LoadingSpinnerProps) {
  return (
    <div className="flex justify-center items-center py-8">
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center"
      >
        <div className="relative w-24 h-24 flex items-center justify-center mb-4">
          {/* Outer track */}
          <div className="absolute inset-0 rounded-full border-[0.5px] border-[#bfc9bc]/30" />
          {/* Slow-rotating thin ring */}
          <div className="loading-ring absolute inset-0 rounded-full border-t-[1.5px] border-[#00652c]/60" />
          {/* Pulsing center dot */}
          <div className="flex flex-col items-center">
            <div className="pulse-dot w-2.5 h-2.5 rounded-full bg-[#00652c] shadow-[0_0_16px_rgba(0,101,44,0.5)]" />
          </div>
        </div>
        <p className="text-[10px] font-bold tracking-[0.2em] text-[#3f493f] uppercase">
          {message ?? 'Loading'}
        </p>
      </div>
    </div>
  );
}
