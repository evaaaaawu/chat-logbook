import { useCallback, useEffect, useRef, useState } from "react";

export interface ToastState {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface UseToastResult {
  toast: ToastState | null;
  showToast: (toast: ToastState) => void;
  dismissToast: () => void;
}

const TOAST_TIMEOUT_MS = 5000;

export function useToast(): UseToastResult {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showToast = useCallback(
    (next: ToastState) => {
      clearTimer();
      setToast(next);
      timerRef.current = setTimeout(() => setToast(null), TOAST_TIMEOUT_MS);
    },
    [clearTimer]
  );

  const dismissToast = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  return { toast, showToast, dismissToast };
}
