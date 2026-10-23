"use client";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";

import type { ButtonHTMLAttributes } from "react";

export type DetailPanelActionVariant =
  "default" | "primary" | "info" | "danger";

/**
 * The row a detail header's actions sit in. Every detail screen uses this one class, so the
 * square icon buttons keep the same spacing wherever they appear — and a nested row (a lock
 * button beside the shared edit/delete pair) lines up with the buttons around it.
 */
export const DETAIL_ACTION_ROW_CLASS =
  "flex flex-wrap items-center justify-end gap-2";

const variantClasses: Record<DetailPanelActionVariant, string> = {
  default:
    "border-border-secondary bg-surface-primary text-text-primary hover:bg-surface-secondary",
  primary: "border-brand bg-brand text-white hover:bg-brand-hover",
  info: "border-info-bg bg-info-bg text-info-text hover:brightness-[0.97]",
  danger:
    "border-danger-bg bg-danger-bg text-danger-text hover:brightness-[0.97]",
};

// Icon-only buttons mirror the list actions column: neutral square chrome, coloured glyph
const iconOnlyVariantClasses: Record<DetailPanelActionVariant, string> = {
  default:
    "border-border-secondary bg-surface-primary text-text-secondary hover:bg-surface-secondary hover:text-text-primary",
  primary: "border-brand bg-brand text-white hover:bg-brand-hover",
  info: "border-border-secondary bg-surface-primary text-info-text hover:bg-surface-secondary",
  danger:
    "border-border-secondary bg-surface-primary text-danger-text hover:bg-surface-secondary hover:text-danger-text",
};

export interface DetailPanelActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: DetailPanelActionVariant;
  icon?: string;
  iconOnly?: boolean;
  label?: string;
}

export function DetailPanelActionButton({
  variant = "default",
  icon,
  iconOnly,
  label,
  className,
  type = "button",
  ...props
}: Readonly<DetailPanelActionButtonProps>) {
  const hasLabel = Boolean(label?.trim());
  const resolvedIconOnly = iconOnly ?? !hasLabel;
  const squareIcon = resolvedIconOnly && Boolean(icon);

  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        squareIcon
          ? "h-9 w-9 justify-center rounded-md"
          : "gap-1 rounded-md px-2.5 py-1 text-xs",
        squareIcon ? iconOnlyVariantClasses[variant] : variantClasses[variant],
        className,
      )}
      {...props}
    >
      {icon ? <Icon name={icon} size={18} /> : null}
      {!resolvedIconOnly && hasLabel ? <span>{label}</span> : null}
    </button>
  );
}
