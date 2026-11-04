"use client";

import { offset } from "@floating-ui/react";
import { isValid, parse } from "date-fns";
import { enUS } from "date-fns/locale";
import { useTranslations } from "next-intl";
import { forwardRef, useEffect, useRef, useState } from "react";
import ReactDatePicker, { registerLocale } from "react-datepicker";

import {
  DATE_PICKER_CALENDAR_CLASS,
  DATE_PICKER_POPPER_CLASS,
  DATE_PICKER_PORTAL_ID,
  DatePickerHeader,
} from "@/kernel/core/components/ui/DatePickerHeader";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";
import { parseIsoDate, toIsoDate } from "@/kernel/core/lib/date-picker-utils";

import type { InputHTMLAttributes } from "react";

registerLocale("en", enUS);

interface DateInputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  locked?: boolean;
  error?: boolean;
  onOpenCalendar?: (input: HTMLInputElement | null) => void;
}

const DateInputField = forwardRef<HTMLInputElement, DateInputFieldProps>(
  function DateInputField(
    {
      locked,
      error,
      className,
      disabled,
      onClick: _onClick,
      onFocus,
      onOpenCalendar,
      ...inputProps
    },
    ref,
  ) {
    const t = useTranslations("common");
    const isLocked = Boolean(locked || disabled);

    return (
      <div
        className={cn(
          "flex h-[38px] w-full items-center gap-1.5 rounded-md border border-border-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none transition-[border,box-shadow] [font-family:inherit]",
          isLocked
            ? "cursor-not-allowed bg-surface-secondary text-text-secondary"
            : "focus-within:border-brand focus-within:shadow-[0_0_0_2px_rgba(26,42,94,0.07)]",
          error && "border-danger-text focus-within:border-danger-text",
          className,
        )}
        aria-invalid={error ? true : undefined}
      >
        <input
          ref={ref}
          {...inputProps}
          type="text"
          autoComplete="off"
          disabled={isLocked}
          readOnly={isLocked}
          onFocus={onFocus}
          // The picker's own click-to-toggle is bypassed (controlled `open`
          // state), so an explicit click opens the calendar like the icon
          // does. Focus alone still does not open it (`preventOpenOnFocus`),
          // keeping keyboard tab-through quiet.
          onClick={(event) => {
            if (!isLocked) onOpenCalendar?.(event.currentTarget);
          }}
          className={cn(
            "min-w-0 flex-1 border-none bg-transparent text-sm tabular-nums text-text-primary outline-none [font-family:inherit]",
            "placeholder:text-text-tertiary",
            isLocked ? "cursor-not-allowed text-text-secondary" : "cursor-text",
            className?.includes("text-xs") && "!text-xs",
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={isLocked}
          aria-label={t("openCalendar")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            if (isLocked) return;
            const sibling = event.currentTarget.previousElementSibling;
            onOpenCalendar?.(
              sibling instanceof HTMLInputElement ? sibling : null,
            );
          }}
          className={cn(
            "inline-flex shrink-0 border-none bg-transparent p-0 text-text-tertiary",
            isLocked ? "cursor-not-allowed" : "cursor-pointer",
          )}
        >
          <Icon name="calendar" size={16} />
        </button>
      </div>
    );
  },
);

const TYPED_DATE = /^\d{2}\/\d{2}\/\d{4}$/;

/** A whole dd/MM/yyyy text inside min/max, else undefined. */
function typedDateInRange(
  text: string,
  min?: string,
  max?: string,
): Date | undefined {
  const trimmed = text.trim();
  if (!TYPED_DATE.test(trimmed)) return undefined;
  const date = parse(trimmed, "dd/MM/yyyy", new Date());
  if (!isValid(date)) return undefined;
  const iso = toIsoDate(date);
  if ((min && iso < min) || (max && iso > max)) return undefined;
  return date;
}

export interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  error?: boolean;
  name?: string;
  id?: string;
  /** Told when the calendar opens or closes, for a caller that saves on its own and must know whether a pick may still come. */
  onOpenChange?: (open: boolean) => void;
}

export function DateInput({
  value,
  onChange,
  disabled = false,
  readOnly = false,
  min,
  max,
  placeholder = "dd/mm/yyyy",
  className = "",
  inputClassName = "",
  error = false,
  name,
  id,
  onOpenChange,
}: Readonly<DateInputProps>) {
  const locked = disabled || readOnly;
  const selectedDate = parseIsoDate(value) ?? null;
  const minDate = parseIsoDate(min ?? "");
  const maxDate = parseIsoDate(max ?? "");
  const [isOpen, setIsOpen] = useState(false);
  // Month the calendar opens on when the field holds a whole typed date; set on each open.
  const [openToDate, setOpenToDate] = useState<Date | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);
  const reportedOpen = useRef(false);

  const openCalendar = (input: HTMLInputElement | null) => {
    setOpenToDate(typedDateInRange(input?.value ?? "", min, max));
    setIsOpen(true);
  };

  useEffect(() => {
    if (reportedOpen.current === isOpen) return;
    reportedOpen.current = isOpen;
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnScroll = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".date-input-popper, .date-filter-popper")
      ) {
        return;
      }
      setIsOpen(false);
    };

    const ignoreOutsideUntil = Date.now() + 200;
    const onDocScroll = (event: Event) => {
      if (Date.now() < ignoreOutsideUntil) return;
      closeOnScroll(event);
    };

    const closeOnResize = () => setIsOpen(false);
    document.addEventListener("scroll", onDocScroll, true);
    window.addEventListener("resize", closeOnResize);

    return () => {
      document.removeEventListener("scroll", onDocScroll, true);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="w-full">
      <ReactDatePicker
        selected={selectedDate}
        onChange={(date: Date | null) => {
          if (!date) {
            onChange("");
            setIsOpen(false);
            return;
          }
          const iso = toIsoDate(date);
          if (min && iso < min) return;
          if (max && iso > max) return;
          onChange(iso);
          setIsOpen(false);
        }}
        onChangeRaw={(event) => {
          const target = event?.target;
          if (
            target instanceof HTMLInputElement &&
            target.value.trim() === ""
          ) {
            onChange("");
          }
        }}
        open={isOpen}
        openToDate={openToDate}
        // The picker's own Tab-close only runs for its internal open state, which the
        // controlled `open` never sets. Day keys reach this prop too; only the field's
        // own input (inside the root, unlike the portaled calendar) closes it.
        onKeyDown={(event) => {
          if (
            event.key === "Tab" &&
            event.target instanceof Node &&
            rootRef.current?.contains(event.target)
          ) {
            setIsOpen(false);
          }
        }}
        onClickOutside={(event) => {
          const target = "target" in event ? event.target : null;
          if (target instanceof Node && rootRef.current?.contains(target)) {
            return;
          }
          setIsOpen(false);
        }}
        onCalendarClose={() => setIsOpen(false)}
        locale="en"
        dateFormat="dd/MM/yyyy"
        placeholderText={placeholder}
        minDate={minDate}
        maxDate={maxDate}
        filterDate={(date) => {
          const iso = toIsoDate(date);
          if (min && iso < min) return false;
          if (max && iso > max) return false;
          return true;
        }}
        disabled={locked}
        name={name}
        id={id}
        preventOpenOnFocus
        shouldCloseOnSelect
        renderCustomHeader={DatePickerHeader}
        formatWeekDay={(dayName) => dayName.slice(0, 2)}
        showPopperArrow={false}
        popperModifiers={[offset({ mainAxis: -2, crossAxis: 0 })]}
        popperProps={{ strategy: "fixed" }}
        portalId={DATE_PICKER_PORTAL_ID}
        calendarClassName={DATE_PICKER_CALENDAR_CLASS}
        popperClassName={cn(DATE_PICKER_POPPER_CLASS, "date-input-popper")}
        popperPlacement="bottom"
        wrapperClassName={cn("date-input-wrapper w-full", className)}
        customInput={
          <DateInputField
            locked={locked}
            error={error}
            className={inputClassName}
            onOpenCalendar={openCalendar}
          />
        }
      />
    </div>
  );
}
