"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { FormControl } from "@/kernel/core/components/ui/FormControl";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";

import type { InputHTMLAttributes, ReactNode } from "react";

interface PasswordFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  label: string;
  error?: string;
  hint?: ReactNode;
}

/**
 * A password input with the reveal toggle, so no screen reimplements the eye button.
 *
 * The frame comes from `FormControl` — the label, the required marker and the error line
 * then read the same here as in every other form in the system.
 */
export function PasswordField({
  label,
  error,
  hint,
  required,
  id,
  className = "",
  ...props
}: PasswordFieldProps) {
  const t = useTranslations("auth");
  const [visible, setVisible] = useState(false);
  const fieldId = id ?? props.name;

  return (
    <FormControl label={label} required={required} error={error}>
      <div className="relative">
        <input
          id={fieldId}
          type={visible ? "text" : "password"}
          className={cn(
            "w-full rounded-md border border-border-secondary bg-surface-primary px-3 py-2 pr-10 text-sm text-text-primary outline-none transition-[border,box-shadow] focus:border-brand focus:shadow-[0_0_0_2px_rgba(26,42,94,0.07)] [font-family:inherit]",
            error && "border-danger-text focus:border-danger-text",
            className,
          )}
          {...props}
          required={false}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          <button
            type="button"
            onClick={() => setVisible((prev) => !prev)}
            className="cursor-pointer text-text-tertiary transition-colors hover:text-text-secondary"
            aria-label={visible ? t("hidePassword") : t("showPassword")}
          >
            <Icon name={visible ? "eye-off" : "eye"} size={18} />
          </button>
        </div>
      </div>
      {hint ? (
        <div className="mt-0.5 text-xs text-text-tertiary">{hint}</div>
      ) : null}
    </FormControl>
  );
}
