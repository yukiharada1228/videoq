import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FeedbackContext, type ConfirmOptions, type FeedbackContextValue, type ToastOptions } from './feedback';

interface ConfirmRequest {
  options: Required<Pick<ConfirmOptions, 'title' | 'confirmLabel' | 'cancelLabel' | 'variant'>> &
    Pick<ConfirmOptions, 'description'>;
  resolve: (confirmed: boolean) => void;
}

interface ToastItem extends Required<Omit<ToastOptions, 'durationMs'>> {
  id: number;
}

function normalizeConfirmOptions(options: ConfirmOptions | string): ConfirmRequest['options'] {
  if (typeof options === 'string') {
    return {
      title: options,
      description: undefined,
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      variant: 'default',
    };
  }

  return {
    title: options.title,
    description: options.description,
    confirmLabel: options.confirmLabel ?? 'Confirm',
    cancelLabel: options.cancelLabel ?? 'Cancel',
    variant: options.variant ?? 'default',
  };
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextToastId = useRef(1);

  const resolveConfirm = useCallback((confirmed: boolean) => {
    setConfirmRequest((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  const requestConfirmation = useCallback((options: ConfirmOptions | string) => {
    return new Promise<boolean>((resolve) => {
      setConfirmRequest({
        options: normalizeConfirmOptions(options),
        resolve,
      });
    });
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const id = nextToastId.current;
    nextToastId.current += 1;
    const item: ToastItem = {
      id,
      message: options.message,
      variant: options.variant ?? 'info',
    };

    setToasts((current) => [...current, item]);

    if (options.durationMs !== 0) {
      window.setTimeout(() => dismissToast(id), options.durationMs ?? 4000);
    }
  }, [dismissToast]);

  const contextValue = useMemo<FeedbackContextValue>(() => ({
    requestConfirmation,
    toast,
  }), [requestConfirmation, toast]);

  return (
    <FeedbackContext.Provider value={contextValue}>
      {children}

      <Dialog open={!!confirmRequest} onOpenChange={(open) => !open && resolveConfirm(false)}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{confirmRequest?.options.title}</DialogTitle>
            {confirmRequest?.options.description ? (
              <DialogDescription>{confirmRequest.options.description}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">Confirm this action.</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              autoFocus
              onClick={() => resolveConfirm(false)}
            >
              {confirmRequest?.options.cancelLabel}
            </Button>
            <Button
              type="button"
              variant={confirmRequest?.options.variant === 'danger' ? 'destructive' : 'default'}
              onClick={() => resolveConfirm(true)}
            >
              {confirmRequest?.options.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex w-[min(calc(100vw-2rem),24rem)] flex-col gap-2">
          {toasts.map((toastItem) => (
            <div
              key={toastItem.id}
              role={toastItem.variant === 'error' ? 'alert' : 'status'}
              className={cn(
                'flex items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm font-medium shadow-[0_8px_30px_rgba(28,25,23,0.12)]',
                toastItem.variant === 'error' && 'border-red-200 text-red-700',
                toastItem.variant === 'success' && 'border-green-200 text-green-700',
                toastItem.variant === 'info' && 'border-[#e1e3de] text-[#191c19]',
              )}
            >
              <span className="flex-1 leading-5">{toastItem.message}</span>
              <button
                type="button"
                aria-label="Dismiss notification"
                className="rounded-full p-1 text-current opacity-70 transition-opacity hover:opacity-100"
                onClick={() => dismissToast(toastItem.id)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
