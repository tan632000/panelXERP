"use client";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import { usePausableTimeout } from "@/kernel/core/hooks/usePausableTimeout";
import { cn } from "@/kernel/core/lib/cn";
import {
  TOAST_DURATION_MS,
  type ToastItem,
  type ToastType,
} from "@/kernel/core/lib/toast";

const variants: Record<
  ToastType,
  {
    container: string;
    progress: string;
    iconName: "check" | "alert" | "info" | "alert-triangle";
  }
> = {
  success: {
    container: "bg-[#07bc0c] text-white",
    progress: "bg-white/40",
    iconName: "check",
  },
  error: {
    container: "bg-[#e74c3c] text-white",
    progress: "bg-white/40",
    iconName: "alert",
  },
  info: {
    container: "bg-[#3498db] text-white",
    progress: "bg-white/40",
    iconName: "info",
  },
  warning: {
    container: "bg-[#f1c40f] text-white",
    progress: "bg-white/40",
    iconName: "alert-triangle",
  },
};

function ToastCard({
  item,
  onDismiss,
}: Readonly<{
  item: ToastItem;
  onDismiss: (id: string) => void;
}>) {
  const { paused, pause, resume } = usePausableTimeout(
    () => onDismiss(item.id),
    TOAST_DURATION_MS,
  );
  const variant = variants[item.type];

  return (
    <div
      role="status"
      onMouseEnter={pause}
      onMouseLeave={resume}
      className={cn(
        "pointer-events-auto relative overflow-hidden rounded-md shadow-[0_3px_14px_rgba(0,0,0,0.15)]",
        variant.container,
      )}
    >
      <div className="flex min-h-14 items-center gap-3 py-3 pl-4 pr-10">
        <Icon
          name={variant.iconName}
          size={20}
          className="shrink-0 text-white"
        />
        <p className="flex-1 text-sm leading-snug">{item.message}</p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="absolute top-2.5 right-2.5 cursor-pointer rounded p-0.5 text-white/80 transition-colors hover:text-white"
        aria-label="Dismiss"
      >
        <Icon name="x" size={16} />
      </button>
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 h-[3px] origin-left",
          variant.progress,
        )}
        style={{
          animation: `toast-progress ${TOAST_DURATION_MS}ms linear forwards`,
          animationPlayState: paused ? "paused" : "running",
        }}
      />
    </div>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useNotification();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      // Above the dialogs (z-110): a toast reports something that already happened, so it
      // must stay readable even while a dialog explains the rest of it.
      className="pointer-events-none fixed top-4 right-4 z-[120] flex w-full max-w-[360px] flex-col gap-3"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={dismiss} />
      ))}
    </div>
  );
}
