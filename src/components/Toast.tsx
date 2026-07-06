import { useEffect, useRef } from 'react';

export interface ToastState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

interface ToastProps {
  toast: ToastState | null;
  onDismiss: () => void;
}

function Toast({ toast, onDismiss }: ToastProps) {
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      dismissRef.current();
    }, toast.duration ?? 5000);

    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) {
    return null;
  }

  return (
    <div className="toast" role="status" aria-live="polite" key={toast.id}>
      <span className="toast__message">{toast.message}</span>
      {toast.actionLabel && toast.onAction && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            toast.onAction?.();
            dismissRef.current();
          }}
        >
          {toast.actionLabel}
        </button>
      )}
    </div>
  );
}

export default Toast;
