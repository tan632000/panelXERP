"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/kernel/core/lib/cn";

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const btn =
  "inline-flex cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-[7px] border border-border-secondary bg-surface-primary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary disabled:cursor-default disabled:opacity-50 [font-family:inherit]";
const btnPrimary =
  "inline-flex cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-[7px] border border-brand bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-default disabled:opacity-50 [font-family:inherit]";

const variants: Record<Variant, string> = {
  primary: btnPrimary,
  secondary: btn,
  ghost:
    "inline-flex cursor-pointer items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface-secondary disabled:cursor-default disabled:opacity-50",
};

export function Button({
  variant = "primary",
  loading,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  const t = useTranslations("common");

  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(variants[variant], className)}
      {...props}
    >
      {loading ? t("processing") : children}
    </button>
  );
}
