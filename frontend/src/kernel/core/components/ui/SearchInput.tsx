"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import {
  FilterToggleButton,
  useFilterToggle,
} from "@/kernel/core/components/ui/ListToolbarFilters";
import { cn } from "@/kernel/core/lib/cn";

export interface SearchInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
> {
  value: string;
  onChangeValue: (val: string) => void;
  /** Drops the toolbar width cap, for a search that owns its whole row. */
  fullWidth?: boolean;
}

export function SearchInput({
  value,
  onChangeValue,
  placeholder,
  fullWidth = false,
  className = "",
  ...props
}: SearchInputProps) {
  const t = useTranslations("common");
  const filterToggle = useFilterToggle();

  const field = (
    <div
      data-toolbar-search={filterToggle ? undefined : ""}
      // The min height holds the field at its size in a column (a modal above a long table),
      // where `flex-1` would otherwise shrink it below `h-9`.
      className={cn(
        "flex h-9 min-h-9 min-w-[150px] flex-1 items-center gap-1.5 rounded-[7px] border border-border-secondary bg-surface-primary px-2.5 text-text-tertiary transition-[border-color,box-shadow] hover:border-border-primary",
        "focus-within:border-brand focus-within:text-brand focus-within:shadow-[0_0_0_3px_rgba(26,42,94,0.08)] max-lg:h-10 max-lg:min-h-10",
        // A phone gives the search its own row: shared with a dropdown it cannot show a word.
        fullWidth
          ? "w-full max-w-full"
          : // A desktop keeps the search readable and lets the row wrap instead of squeezing it.
            "max-w-[300px] lg:flex-[1_0_260px] max-lg:max-w-none max-lg:basis-full",
        className,
        // Beside the "Filters" button: a phone shares the field's row with the button, a
        // desktop gives the field a readable width.
        filterToggle && "lg:!max-w-[380px] max-lg:!min-w-0 max-lg:!basis-0",
      )}
    >
      <Icon name="search" size={16} />
      <input
        type="text"
        className="w-full border-none bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary [font-family:inherit]"
        placeholder={placeholder ?? t("search")}
        value={value}
        onChange={(e) => onChangeValue(e.target.value)}
        {...props}
      />
    </div>
  );

  if (!filterToggle) return field;

  // A desktop draws the field and the button straight into the toolbar's row (`contents`); a
  // phone gives the pair a row of its own, the button right after the field.
  return (
    <div
      data-toolbar-search
      className="lg:contents max-lg:flex max-lg:min-w-0 max-lg:basis-full max-lg:items-center max-lg:gap-2"
    >
      {field}
      <FilterToggleButton toggle={filterToggle} />
    </div>
  );
}
