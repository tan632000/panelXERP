"use client";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";

/** A square icon-only button for an editor toolbar; the label is its tooltip and name. */
export function IconToolButton({
  icon,
  label,
  onClick,
  pressed,
  disabled,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  /** Set for a toggle, such as mirroring, so its on state shows. */
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none transition-colors disabled:cursor-default disabled:opacity-40",
        pressed
          ? "bg-brand-light text-brand"
          : "bg-transparent text-text-secondary hover:bg-surface-secondary hover:text-text-primary",
      )}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
