"use client";

import React from "react";

import { FORM_LABEL_TEXT_CLASS } from "@kernel/core/components/ui/form-label-styles";
import { LINE_ERROR_TEXT_CLASS } from "@kernel/core/components/ui/line-table-styles";
import { NumberInput } from "@kernel/core/components/ui/NumberInput";
import { cn } from "@kernel/core/lib/cn";

import type { InputHTMLAttributes } from "react";

export interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /**
   * Hides the label visually while keeping it for assistive technology.
   *
   * For a row of a line editor, where one header row already names every column and
   * repeating the label in each cell would be noise on screen but is still the only thing
   * naming the control to a screen reader.
   */
  labelHidden?: boolean;
  required?: boolean;
  span2?: boolean;
  error?: string;
  /** Optional custom class name for the error text span. */
  errorClassName?: string;
  /**
   * A short note under the input.
   *
   * Anything explaining how the field behaves belongs here, not in the label: a label long
   * enough to wrap pushes its own input a line lower than the one beside it in the grid,
   * while a note under the input leaves every input in the row on the same baseline. Hidden
   * while an error is showing, so the field never grows by two lines at once.
   */
  hint?: string;
  /** Forwarded to the underlying `NumberInput` when `type="number"`; ignored otherwise. */
  decimalScale?: number;
  /** Forwarded to the underlying `NumberInput` when `type="number"`; ignored otherwise. */
  allowNegative?: boolean;
}

export function FormInput({
  label,
  labelHidden,
  required,
  span2,
  className = "",
  readOnly,
  error,
  errorClassName,
  hint,
  ...props
}: FormInputProps) {
  const controlClassName =
    "w-full rounded-md border border-border-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none transition-[border,box-shadow] focus:border-brand focus:shadow-[0_0_0_2px_rgba(26,42,94,0.07)] [font-family:inherit]";
  // A numeric field is not a browser number input: it is the shared masked control, so a
  // quantity, price, discount or freight cost reads `1.234.567,89` while it is typed.
  const { type, value, defaultValue, ...controlProps } = props;
  const isNumber = type === "number";
  const isInputDisabled = readOnly || props.disabled;
  return (
    <div className={cn("flex flex-col gap-1", span2 && "col-span-2")}>
      <div
        className={cn(
          `text-left text-sm ${FORM_LABEL_TEXT_CLASS}`,
          labelHidden && "sr-only",
        )}
      >
        {label}
        {required && <span className="text-danger-text"> *</span>}
      </div>
      {isNumber ? (
        <NumberInput
          {...controlProps}
          className={className}
          value={singleValue(value)}
          defaultValue={singleValue(defaultValue)}
          error={Boolean(error)}
          required={false}
          aria-required={required || undefined}
          readOnly={readOnly}
        />
      ) : (
        <input
          className={cn(
            controlClassName,
            error && "border-danger-text focus:border-danger-text",
            isInputDisabled &&
              "bg-surface-secondary text-text-secondary cursor-not-allowed",
            className,
          )}
          {...props}
          required={false}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          readOnly={readOnly}
        />
      )}
      {error ? (
        <span
          className={cn(
            // A field of a line row reads its message at the line table's size, like every
            // other control in that row.
            labelHidden
              ? LINE_ERROR_TEXT_CLASS
              : "text-xs text-danger-text mt-0.5",
            errorClassName,
          )}
        >
          {error}
        </span>
      ) : null}
      {!error && hint ? (
        <span className="mt-0.5 text-xs text-text-tertiary">{hint}</span>
      ) : null}
    </div>
  );
}

/** A number field never carries the multi-value form a `<select multiple>` uses. */
function singleValue(
  value: InputHTMLAttributes<HTMLInputElement>["value"],
): string | number | undefined {
  return Array.isArray(value)
    ? undefined
    : (value as string | number | undefined);
}
