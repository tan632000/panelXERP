import { FORM_LABEL_TEXT_CLASS } from "@/kernel/core/components/ui/form-label-styles";

import type { InputHTMLAttributes, ReactNode } from "react";

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: ReactNode;
  suffix?: ReactNode;
}

export function FormField({
  label,
  error,
  hint,
  suffix,
  id,
  className = "",
  ...props
}: FormFieldProps) {
  const fieldId = id ?? props.name;
  const inputClassName = `w-full rounded-md border border-border-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none transition-[border,box-shadow] focus:border-brand focus:shadow-[0_0_0_2px_rgba(26,42,94,0.07)] [font-family:inherit] ${error ? "border-danger-text" : ""} ${suffix ? "pr-10" : ""} ${className}`;

  return (
    <div className="space-y-1">
      <label
        htmlFor={fieldId}
        className={`block text-sm ${FORM_LABEL_TEXT_CLASS}`}
      >
        {label}
      </label>
      {suffix ? (
        <div className="relative">
          <input id={fieldId} className={inputClassName} {...props} />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            {suffix}
          </div>
        </div>
      ) : (
        <input id={fieldId} className={inputClassName} {...props} />
      )}
      {hint && <p className="text-sm text-text-secondary">{hint}</p>}
      {error && <p className="text-xs text-danger-text">{error}</p>}
    </div>
  );
}
