"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  subscribeToast,
  type ToastItem,
  type ToastType,
} from "@/kernel/core/lib/toast";

interface NotificationContextValue {
  toasts: ToastItem[];
  showToast: (type: ToastType, message: string) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  showWarning: (message: string) => void;
  dismiss: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const showSuccess = useCallback(
    (message: string) => showToast("success", message),
    [showToast],
  );
  const showError = useCallback(
    (message: string) => showToast("error", message),
    [showToast],
  );
  const showInfo = useCallback(
    (message: string) => showToast("info", message),
    [showToast],
  );
  const showWarning = useCallback(
    (message: string) => showToast("warning", message),
    [showToast],
  );

  useEffect(() => {
    return subscribeToast(({ type, message }) => showToast(type, message));
  }, [showToast]);

  const value = useMemo(
    () => ({
      toasts,
      showToast,
      showSuccess,
      showError,
      showInfo,
      showWarning,
      dismiss,
    }),
    [toasts, showToast, showSuccess, showError, showInfo, showWarning, dismiss],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return ctx;
}
