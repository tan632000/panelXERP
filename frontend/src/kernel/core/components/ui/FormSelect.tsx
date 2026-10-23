"use client";

import React, { useState } from "react";

import {
  DropdownSelect,
  type DropdownAsyncLoadProps,
  type DropdownOption,
} from "@kernel/core/components/ui/DropdownSelect";
import { FORM_LABEL_TEXT_CLASS } from "@kernel/core/components/ui/form-label-styles";
import { LINE_ERROR_TEXT_CLASS } from "@kernel/core/components/ui/line-table-styles";
import { cn } from "@kernel/core/lib/cn";

export interface FormSelectOption {
  value: string;
  label: string;
  icon?: string;
}

export interface FormSelectProps {
  label: string;
  /**
   * Hides the label visually while keeping it for assistive technology.
   *
   * For a row of a line editor, where one header row already names every column and
   * repeating the label in each cell would be noise on screen but is still the only thing
   * naming the control to a screen reader.
   */
  labelHidden?: boolean;
  options: Array<string | FormSelectOption>;
  required?: boolean;
  span2?: boolean;
  className?: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  allowCustomInput?: boolean;
  allowClear?: boolean;
  /** Closed lists (a handful of units, currencies) skip the panel search box. */
  searchable?: boolean;
  error?: string;
  placeholder?: string;
  asyncLoad?: DropdownAsyncLoadProps;
}

function normalizeOptions(
  options: Array<string | FormSelectOption>,
): DropdownOption[] {
  return options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt,
  );
}

export function FormSelect({
  label,
  labelHidden,
  options,
  required,
  span2,
  className = "",
  value: controlledValue,
  defaultValue = "",
  disabled,
  name,
  id,
  onChange,
  allowCustomInput = false,
  allowClear,
  searchable,
  error,
  placeholder,
  asyncLoad,
}: FormSelectProps) {
  const normalizedOptions = normalizeOptions(options);
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState(
    controlledValue ?? defaultValue,
  );
  const value = isControlled ? controlledValue : internalValue;

  const handleChange = (nextValue: string) => {
    if (!isControlled) setInternalValue(nextValue);
    onChange?.({
      target: { value: nextValue, name: name ?? "" },
    } as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <div
      className={cn(
        "relative flex flex-col gap-1",
        span2 && "col-span-2",
        className,
      )}
      /* The dropdown is a custom widget with a closed prop list, so the field wrapper is what
         carries the invalid marker the scroll helper looks for. */
      data-invalid={error ? true : undefined}
    >
      <div
        className={cn(
          `text-sm ${FORM_LABEL_TEXT_CLASS}`,
          labelHidden && "sr-only",
        )}
      >
        {label}
        {required && <span className="text-danger-text"> *</span>}
      </div>
      <DropdownSelect
        id={id}
        options={normalizedOptions}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        allowCustomInput={allowCustomInput}
        allowClear={allowClear}
        searchable={searchable}
        placeholder={placeholder}
        asyncLoad={asyncLoad}
        fullWidth
        className={cn(
          error && "[&_button]:border-danger-text [&_input]:border-danger-text",
        )}
      />
      {error && (
        <span
          className={
            labelHidden
              ? LINE_ERROR_TEXT_CLASS
              : "text-xs text-danger-text mt-0.5"
          }
        >
          {error}
        </span>
      )}
      {name && (
        <input
          type="text"
          name={name}
          value={value}
          onChange={() => {}}
          tabIndex={-1}
          aria-hidden
          style={{
            position: "absolute",
            bottom: "12px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "1px",
            height: "1px",
            padding: 0,
            margin: "-1px",
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
            border: 0,
            opacity: 0,
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
