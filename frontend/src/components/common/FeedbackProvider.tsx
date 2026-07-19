import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogHeading,
  useDialog,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FeedbackContext, type ConfirmOptions, type FeedbackContextValue, type ToastOptions } from './feedback';

interface ConfirmRequest {
  options: Required<Pick<ConfirmOptions, 'title' | 'confirmLabel' | 'cancelLabel' | 'variant'>> &
    Pick<ConfirmOptions, 'description'>;
  navigationKey: string;
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
  const location = useLocation();
  const navigationKey = `${location.pathname}${location.search}${location.hash}`;
  const previousNavigationKey = useRef(navigationKey);
  const activeConfirmRequest = useRef<ConfirmRequest | null>(null);
  const [confirmRequest, setConfirmRequestState] = useState<ConfirmRequest | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextToastId = useRef(1);

  const resolveConfirm = useCallback((confirmed: boolean) => {
    const current = activeConfirmRequest.current;
    if (!current) return;

    activeConfirmRequest.current = null;
    setConfirmRequestState(null);
    current.resolve(confirmed);
  }, []);

  const requestConfirmation = useCallback((options: ConfirmOptions | string) => {
    return new Promise<boolean>((resolve) => {
      activeConfirmRequest.current?.resolve(false);

      const nextRequest = {
        options: normalizeConfirmOptions(options),
        navigationKey,
        resolve,
      };
      activeConfirmRequest.current = nextRequest;
      setConfirmRequestState(nextRequest);
    });
  }, [navigationKey]);

  useLayoutEffect(() => {
    if (previousNavigationKey.current === navigationKey) {
      return;
    }

    previousNavigationKey.current = navigationKey;
    const current = activeConfirmRequest.current;
    if (current && current.navigationKey !== navigationKey) {
      activeConfirmRequest.current = null;
      current.resolve(false);
      window.queueMicrotask(() => {
        setConfirmRequestState((latest) => (latest === current ? null : latest));
      });
    }
  }, [navigationKey]);

  const visibleConfirmRequest =
    confirmRequest &&
    confirmRequest.navigationKey === navigationKey
      ? confirmRequest
      : null;

  const isConfirmOpen = !!visibleConfirmRequest;

  const confirmDialog = useDialog({
    open: isConfirmOpen,
    onOpenChange: (open) => {
      if (!open) resolveConfirm(false);
    },
  });

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

      {isConfirmOpen && visibleConfirmRequest && (
        <Dialog {...confirmDialog.dialogProps} width="min(28rem, 92vw)">
          <DialogContent>
            <DialogHeader>
              <DialogHeading {...confirmDialog.headingProps}>
                {visibleConfirmRequest.options.title}
              </DialogHeading>
            </DialogHeader>
            <DialogBody>
              {visibleConfirmRequest.options.description ? (
                <p className="text-std-16N-170 text-solid-gray-700">
                  {visibleConfirmRequest.options.description}
                </p>
              ) : (
                <p className="sr-only">Confirm this action.</p>
              )}
            </DialogBody>
            <DialogActions>
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => resolveConfirm(false)}
                >
                  {visibleConfirmRequest.options.cancelLabel}
                </Button>
                <Button
                  type="button"
                  variant="solid"
                  className={
                    visibleConfirmRequest.options.variant === 'danger'
                      ? 'bg-error-1 hover:bg-red-1000 active:bg-red-1200'
                      : undefined
                  }
                  onClick={() => resolveConfirm(true)}
                >
                  {visibleConfirmRequest.options.confirmLabel}
                </Button>
              </div>
            </DialogActions>
          </DialogContent>
        </Dialog>
      )}

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex w-[min(calc(100vw-2rem),24rem)] flex-col gap-2">
          {toasts.map((toastItem) => (
            <div
              key={toastItem.id}
              role={toastItem.variant === 'error' ? 'alert' : 'status'}
              className={cn(
                'flex items-start gap-3 border bg-white px-4 py-3 text-sm font-medium',
                toastItem.variant === 'error' && 'border-error-1 text-error-1',
                toastItem.variant === 'success' && 'border-success-2 text-success-2',
                toastItem.variant === 'info' && 'border-solid-gray-420 text-solid-gray-800',
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
