export type ToastType = "success" | "error" | "info" | "warning";

export const TOAST_DURATION_MS = 3000;

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

type ToastListener = (toast: Omit<ToastItem, "id">) => void;
const toastListeners = new Set<ToastListener>();

export function subscribeToast(listener: ToastListener) {
  toastListeners.add(listener);
  return () => {
    toastListeners.delete(listener);
  };
}

export function emitToast(type: ToastType, message: string) {
  toastListeners.forEach((listener) => listener({ type, message }));
}

/** Global toast singleton — works outside React component tree */
export const toast = {
  showSuccess: (message: string) => emitToast("success", message),
  showError: (message: string) => emitToast("error", message),
  showInfo: (message: string) => emitToast("info", message),
  showWarning: (message: string) => emitToast("warning", message),
};
