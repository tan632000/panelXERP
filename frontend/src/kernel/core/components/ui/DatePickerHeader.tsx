"use client";

import { format } from "date-fns";
import { enUS } from "date-fns/locale";

import { Icon } from "@/kernel/core/components/ui/Icon";

import type { ReactDatePickerCustomHeaderProps } from "react-datepicker";

export const DATE_PICKER_PORTAL_ID = "date-picker-portal";
export const DATE_PICKER_CALENDAR_CLASS = "date-filter-calendar";
export const DATE_PICKER_POPPER_CLASS = "date-filter-popper";

/** Years offered in the header select: past enough for warehouse history, ahead for need dates. */
const YEAR_RANGE_PAST = 30;
const YEAR_RANGE_FUTURE = 10;

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, month) => ({
  value: month,
  label: format(new Date(2020, month, 1), "MMM", { locale: enUS }),
}));

function yearOptions(anchorYear: number): number[] {
  const start = anchorYear - YEAR_RANGE_PAST;
  const end = anchorYear + YEAR_RANGE_FUTURE;
  const years: number[] = [];
  for (let year = start; year <= end; year += 1) years.push(year);
  return years;
}

const NAV_BUTTON_CLASS =
  "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40";

const SELECT_CLASS =
  "h-7 cursor-pointer rounded-md border border-border-secondary bg-surface-primary px-1.5 text-sm font-medium text-text-primary outline-none [font-family:inherit] focus:border-brand";

/**
 * Calendar header for every DateInput and DateFilterInput. Month chevrons step one month;
 * the year select (and year chevrons) jump by year so a distant date is reachable without
 * clicking through every month.
 */
export function DatePickerHeader({
  date,
  changeYear,
  changeMonth,
  decreaseMonth,
  increaseMonth,
  decreaseYear,
  increaseYear,
  prevMonthButtonDisabled,
  nextMonthButtonDisabled,
  prevYearButtonDisabled,
  nextYearButtonDisabled,
}: Readonly<ReactDatePickerCustomHeaderProps>) {
  const month = date.getMonth();
  const year = date.getFullYear();
  const years = yearOptions(year);

  return (
    <div className="flex items-center justify-between gap-1 px-1 pb-2 pt-1">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Previous year"
          disabled={prevYearButtonDisabled}
          onClick={decreaseYear}
          className={NAV_BUTTON_CLASS}
        >
          <Icon name="chevrons-left" size={16} />
        </button>
        <button
          type="button"
          aria-label="Previous month"
          disabled={prevMonthButtonDisabled}
          onClick={decreaseMonth}
          className={NAV_BUTTON_CLASS}
        >
          <Icon name="chevron-left" size={16} />
        </button>
      </div>

      <div className="flex items-center gap-1">
        <select
          aria-label="Month"
          value={month}
          onChange={(event) => changeMonth(Number(event.target.value))}
          className={SELECT_CLASS}
        >
          {MONTH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Year"
          value={year}
          onChange={(event) => changeYear(Number(event.target.value))}
          className={SELECT_CLASS}
        >
          {years.map((optionYear) => (
            <option key={optionYear} value={optionYear}>
              {optionYear}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="Next month"
          disabled={nextMonthButtonDisabled}
          onClick={increaseMonth}
          className={NAV_BUTTON_CLASS}
        >
          <Icon name="chevron-right" size={16} />
        </button>
        <button
          type="button"
          aria-label="Next year"
          disabled={nextYearButtonDisabled}
          onClick={increaseYear}
          className={NAV_BUTTON_CLASS}
        >
          <Icon name="chevrons-right" size={16} />
        </button>
      </div>
    </div>
  );
}
