import type { ToastState } from "@/shared/useToast";

interface ToastProps {
  toast: ToastState | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  if (!toast) return null;

  const handleAction = () => {
    toast.onAction?.();
    onDismiss();
  };

  return (
    <div
      data-testid="toast"
      role="status"
      className="fixed top-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-md border border-border bg-card px-4 py-2.5 text-sm text-foreground shadow-lg"
    >
      <span>{toast.message}</span>
      {toast.actionLabel && toast.onAction && (
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleAction}
            className="text-xs font-semibold uppercase tracking-wide text-primary transition-colors hover:text-primary-hover"
          >
            {toast.actionLabel}
          </button>
          {toast.actionHint && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {toast.actionHint}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
