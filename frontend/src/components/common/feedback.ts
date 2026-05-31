import { createContext, useContext } from 'react';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
}

export interface ToastOptions {
  message: string;
  variant?: 'info' | 'success' | 'error';
  durationMs?: number;
}

export interface FeedbackContextValue {
  requestConfirmation: (options: ConfirmOptions | string) => Promise<boolean>;
  toast: (options: ToastOptions) => void;
}

export const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useConfirm() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useConfirm must be used within FeedbackProvider');
  }
  return context.requestConfirmation;
}

export function useToast() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useToast must be used within FeedbackProvider');
  }
  return context.toast;
}
