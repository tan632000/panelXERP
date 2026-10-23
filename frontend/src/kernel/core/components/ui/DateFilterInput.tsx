"use client";

import { offset } from "@floating-ui/react";
import { enUS } from "date-fns/locale";
import { useTranslations } from "next-intl";
import { forwardRef } from "react";
import ReactDatePicker, { registerLocale } from "react-datepicker";

import {
  DATE_PICKER_CALENDAR_CLASS,
  DATE_PICKER_POPPER_CLASS,
  DATE_PICKER_PORTAL_ID,
  DatePickerHeader,
} from "@/kernel/core/components/ui/DatePickerHeader";
import { Icon } from "@/kernel/core/components/ui/Icon";
import {
  FilterField,
  renderInToolbarSlot,
  useToolbarFilterSlot,
} from "@/kernel/core/components/ui/ListToolbarFilters";
import { cn } from "@/kernel/core/lib/cn";
import { parseIsoDate, toIsoDate } from "@/kernel/core/lib/date-picker-utils";
import { formatIsoDate } from "@/kernel/core/lib/formatters";

import type { FocusEvent, InputHTMLAttributes, MouseEvent } from "react";

registerLocale("en", enUS);

interface DateFilterInputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** The date text takes the room the field is given, so the calendar sits at its edge. */
  fill?: boolean;
  showClear?: boolean;
  onClear?: () => void;
  clearLabel?: string;
}

const DateFilterInputField = forwardRef<
  HTMLInputElement,
  DateFilterInputFieldProps
>(function DateFilterInputField(
  {
    label,
    fill,
    showClear,
    onClear,
    clearLabel,
    className,
    disabled,
    onClick,
    onFocus,
    ...inputProps
  },
  ref,
) {
  const openCalendar = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    onClick?.(event as unknown as MouseEvent<HTMLInputElement>);
    onFocus?.(event as unknown as FocusEvent<HTMLInputElement>);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={openCalendar}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.(event as unknown as MouseEvent<HTMLInputElement>);
        }
      }}
      className={cn(
        "flex h-9 w-max min-w-[168px] cursor-pointer items-center gap-1.5 rounded-[7px] border border-border-secondary bg-surface-primary px-2.5",
        // A set date narrows the list, like a set filter dropdown.
        showClear && "border-brand/40 bg-brand-light",
        // A phone stretches the field to whatever its row gives it — half of it in a range.
        "max-lg:h-auto max-lg:min-h-10 max-lg:w-full max-lg:min-w-0",
        disabled && "cursor-not-allowed bg-surface-secondary",
        className,
      )}
    >
      {label ? (
        <span className="shrink-0 text-xs font-normal text-text-tertiary">
          {label}
        </span>
      ) : null}
      <input
        ref={ref}
        readOnly
        disabled={disabled}
        tabIndex={-1}
        {...inputProps}
        className={cn(
          fill ? "w-0 min-w-[10ch] flex-1" : "w-[10ch] min-w-[10ch] shrink-0",
          "cursor-pointer border-none bg-transparent text-sm font-normal tabular-nums text-text-primary outline-none",
          // `w-0` + `flex-1`: an input's intrinsic width (about 20 characters) would otherwise
          // keep two of them from sharing a phone row.
          "max-lg:w-0 max-lg:min-w-0 max-lg:flex-1",
          "placeholder:text-text-tertiary disabled:cursor-not-allowed disabled:text-text-tertiary",
          "[font-family:inherit] pointer-events-none",
        )}
      />
      {showClear ? (
        <button
          type="button"
          aria-label={clearLabel}
          title={clearLabel}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClear?.();
          }}
          className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded p-0.5 text-text-tertiary transition-colors hover:bg-black/5 hover:text-text-primary"
        >
          <Icon name="x" size={12} />
        </button>
      ) : null}
      <span className="inline-flex shrink-0 cursor-pointer text-text-tertiary">
        <Icon name="calendar" size={16} />
      </span>
    </div>
  );
});

export interface DateFilterInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  /** Fills the width it is given — a cell of the filter panel. */
  stretch?: boolean;
}

export function DateFilterInput({
  label,
  value,
  onChange,
  disabled = false,
  min,
  max,
  placeholder = "dd/mm/yyyy",
  className = "",
  stretch = false,
}: Readonly<DateFilterInputProps>) {
  const t = useTranslations("common");
  const selectedDate = parseIsoDate(value) ?? null;
  const minDate = parseIsoDate(min ?? "");
  const maxDate = parseIsoDate(max ?? "");

  // A single date of a list toolbar (an as-of date) moves into the filter panel, captioned
  // there instead of inside the field.
  const slot = useToolbarFilterSlot({
    active: Boolean(value),
    reset: () => onChange(""),
    chip: `${label.replace(/:\s*$/, "")}: ${formatIsoDate(value)}`,
  });
  const inPanel = Boolean(slot);
  const fill = stretch || inPanel;

  const picker = (
    <ReactDatePicker
      selected={selectedDate}
      onChange={(date: Date | null) => onChange(date ? toIsoDate(date) : "")}
      locale="en"
      dateFormat="dd/MM/yyyy"
      placeholderText={placeholder}
      minDate={minDate}
      maxDate={maxDate}
      disabled={disabled}
      renderCustomHeader={DatePickerHeader}
      formatWeekDay={(dayName) => dayName.slice(0, 2)}
      showPopperArrow
      popperModifiers={[offset({ mainAxis: -6 })]}
      portalId={DATE_PICKER_PORTAL_ID}
      calendarClassName={DATE_PICKER_CALENDAR_CLASS}
      popperClassName={DATE_PICKER_POPPER_CLASS}
      popperPlacement="bottom-start"
      wrapperClassName={cn(
        "date-filter-input-wrapper w-auto",
        // Beats the `inline-flex` / `width: auto` the wrapper gets in `globals.css`.
        fill && "!flex !w-full [&>div]:!flex [&>div]:!w-full",
        className,
      )}
      customInput={
        <DateFilterInputField
          // A single date in the panel is captioned above the field, not inside it.
          label={inPanel ? "" : label}
          fill={fill}
          className={fill ? "!w-full !min-w-0" : undefined}
          showClear={Boolean(value) && !disabled}
          onClear={() => onChange("")}
          clearLabel={t("clear")}
        />
      }
    />
  );

  return renderInToolbarSlot(
    slot,
    <FilterField label={label.replace(/:\s*$/, "")}>{picker}</FilterField>,
    picker,
  );
}
