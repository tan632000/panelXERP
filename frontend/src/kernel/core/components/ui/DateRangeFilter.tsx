"use client";

import { useTranslations } from "next-intl";

import { DateFilterInput } from "@/kernel/core/components/ui/DateFilterInput";
import {
  FilterField,
  renderInToolbarSlot,
  ToolbarFilterPart,
  useToolbarFilterSlot,
} from "@/kernel/core/components/ui/ListToolbarFilters";
import { cn } from "@/kernel/core/lib/cn";
import { formatIsoDate } from "@/kernel/core/lib/formatters";

export interface DateRangeFilterProps {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  fromLabel?: string;
  toLabel?: string;
  className?: string;
  disabled?: boolean;
}

export function DateRangeFilter({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  fromLabel,
  toLabel,
  className = "",
  disabled = false,
}: DateRangeFilterProps) {
  const t = useTranslations("common");

  const handleDateFromChange = (value: string) => {
    onDateFromChange(value);

    if (value && dateTo && dateTo < value) {
      onDateToChange(value);
    }
  };

  const handleDateToChange = (value: string) => {
    if (value && dateFrom && value < dateFrom) {
      onDateToChange(dateFrom);
      return;
    }

    onDateToChange(value);
  };

  // In a list toolbar the range moves into the filter panel, where the quick chips fill it.
  const slot = useToolbarFilterSlot({
    active: Boolean(dateFrom || dateTo),
    reset: () => {
      onDateFromChange("");
      onDateToChange("");
    },
    setRange: (from, to) => {
      onDateFromChange(from);
      onDateToChange(to);
    },
    chip: `${t("dateRange")}: ${formatIsoDate(dateFrom) || "…"} → ${formatIsoDate(dateTo) || "…"}`,
  });

  const inline = (
    // A phone gives the range a row of its own, split evenly between its two dates.
    <div
      className={cn(
        "flex flex-wrap items-center gap-[7px] max-lg:min-w-0 max-lg:basis-full max-lg:flex-nowrap",
        className,
      )}
    >
      <div className="inline-flex shrink-0 max-lg:min-w-0 max-lg:flex-1">
        <DateFilterInput
          label={fromLabel ?? t("dateFrom")}
          value={dateFrom}
          max={dateTo || undefined}
          onChange={handleDateFromChange}
          disabled={disabled}
        />
      </div>
      <div className="inline-flex shrink-0 max-lg:min-w-0 max-lg:flex-1">
        <DateFilterInput
          label={toLabel ?? t("dateTo")}
          value={dateTo}
          min={dateFrom || undefined}
          onChange={handleDateToChange}
          disabled={disabled}
        />
      </div>
    </div>
  );

  return renderInToolbarSlot(
    slot,
    // The panel appends a field when it mounts, so a filter loading its values late lands after
    // the range; the range stays the last field regardless.
    <FilterField label={t("dateRange")} wide last>
      <ToolbarFilterPart>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <DateFilterInput
              label={fromLabel ?? t("dateFrom")}
              value={dateFrom}
              max={dateTo || undefined}
              onChange={handleDateFromChange}
              disabled={disabled}
              stretch
            />
          </div>
          <span className="shrink-0 text-text-tertiary">→</span>
          <div className="min-w-0 flex-1">
            <DateFilterInput
              label={toLabel ?? t("dateTo")}
              value={dateTo}
              min={dateFrom || undefined}
              onChange={handleDateToChange}
              disabled={disabled}
              stretch
            />
          </div>
        </div>
      </ToolbarFilterPart>
    </FilterField>,
    <ToolbarFilterPart>{inline}</ToolbarFilterPart>,
  );
}
