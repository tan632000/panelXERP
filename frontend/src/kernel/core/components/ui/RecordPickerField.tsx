"use client";

import { useTranslations } from "next-intl";
import React, { useCallback, useId, useMemo, useRef, useState } from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import {
  RecordPickerDialog,
  type RecordPickerDialogProps,
} from "@/kernel/core/components/ui/RecordPickerDialog";
import { cn } from "@/kernel/core/lib/cn";
import { recordLabelToQuery } from "@/kernel/core/lib/record-label";

export interface RecordPickerFieldProps<T> extends Omit<
  RecordPickerDialogProps<T>,
  "isOpen" | "onClose" | "id" | "selectedKeys"
> {
  /**
   * Label of the current selection. It is what the input shows, and — on a pick-only field —
   * the only thing it can ever show, because such a field is never typed into.
   */
  displayValue: string;
  placeholder?: string;
  disabled?: boolean;
  /** Lets the owner keep its query idle until the popup is actually open. */
  onOpenChange?: (open: boolean) => void;
  /** Called when the field is emptied, so blanking it really unsets the value. */
  onClear?: () => void;
  /**
   * Set for a reference that may also be written by hand — an RFQ or quotation number the
   * catalogue does not hold yet. That field stays typeable, and the typed text is committed
   * when it is left or the popup closed. Without it the field is pick-only: it cannot be
   * typed into at all, so a keyword can never be mistaken for a value.
   */
  onFreeText?: (text: string) => void;
  /**
   * The selected value: its rows are highlighted in the popup, and it stays selectable even
   * when `takenValues` lists it.
   */
  value?: string;
  /** Reads the value of a record. Required for `value` and `takenValues` to mean anything. */
  getValue?: (item: T) => string;
  /**
   * Values held by sibling rows of a repeat-free reference list. They stay listed and are
   * shown disabled, rather than being dropped — hiding them empties the popup once most of a
   * short list is in use.
   */
  takenValues?: readonly string[];
  /**
   * The `rowKey` of the held row. Marks that row instead of every row whose value matches,
   * for a list where several rows share one value; `""` marks none.
   */
  selectedKey?: string;
  className?: string;
}

const NO_TAKEN_VALUES: readonly string[] = [];

/**
 * Reference field that resolves through a search popup instead of a dropdown.
 *
 * A pick-only field opens its popup as soon as the input is clicked and cannot be typed into,
 * so what it holds is always a record of the owning list. A field given `onFreeText` — an RFQ
 * or quotation number — stays typeable instead, and opens its popup from the search button or
 * Enter.
 *
 * Feature code supplies the columns, records and paging state; everything else is generic, so
 * every reference field (material, mold, production process, …) uses this same component.
 */
export function RecordPickerField<T>({
  displayValue,
  placeholder,
  disabled = false,
  className = "",
  onOpenChange,
  onClear,
  onFreeText,
  onSelect,
  onSearchChange,
  value,
  getValue,
  takenValues = NO_TAKEN_VALUES,
  selectedKey,
  records,
  rowKey,
  ...dialogProps
}: RecordPickerFieldProps<T>) {
  const t = useTranslations("common");
  const dialogId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /** `null` means nothing has been typed, so the input mirrors the current selection. */
  const [draft, setDraft] = useState<string | null>(null);

  /** A pick-only field is never typed into, so its draft stays `null`. */
  const acceptsFreeText = Boolean(onFreeText);
  const inputValue = draft ?? displayValue;
  /** A pick-only field cannot be emptied by hand, so clearing needs its own button. */
  const showClear =
    !acceptsFreeText && !disabled && Boolean(displayValue && onClear);

  /**
   * Rows of one reference list may not repeat a record, so what sibling rows already hold is
   * greyed out. This row's own selection stays selectable.
   */
  const isRecordDisabled = useMemo(() => {
    if (!getValue || takenValues.length === 0) return undefined;
    const taken = new Set(takenValues.filter((v) => v && v !== value));
    if (taken.size === 0) return undefined;
    return (record: T) => taken.has(getValue(record));
  }, [getValue, takenValues, value]);

  /**
   * The popup opens on the full list rather than on the held record, so the held record is
   * marked instead — every loaded row carrying the selected value.
   */
  const selectedKeys = useMemo(() => {
    // Given at all, the row key decides alone: an empty one means no row is held.
    if (selectedKey !== undefined) {
      return selectedKey ? [selectedKey] : undefined;
    }
    if (!getValue || !value) return undefined;
    const keys = records
      .filter((record) => getValue(record) === value)
      .map(rowKey);
    return keys.length > 0 ? keys : undefined;
  }, [getValue, records, rowKey, selectedKey, value]);

  const open = useCallback(() => {
    // The popup always opens on the full list: the held selection is never copied into the
    // search, which narrowed the list to that one record. Only text typed into a free-text
    // field is a keyword, and its `code — name` form searches by the code half.
    onSearchChange(draft ? recordLabelToQuery(draft) : "");
    setIsOpen(true);
    onOpenChange?.(true);
  }, [draft, onOpenChange, onSearchChange]);

  /**
   * Closing without a pick drops the draft, so the field falls back to the selection it had —
   * unless the field accepts free text, in which case what was typed is the value.
   */
  const close = useCallback(() => {
    setIsOpen(false);
    onOpenChange?.(false);
    if (onFreeText && draft !== null) onFreeText(draft.trim());
    setDraft(null);
    // The popup is portalled and unmounts on close; without this, focus falls back to the
    // page body and Tab no longer moves on to the next field of the form.
    inputRef.current?.focus();
  }, [draft, onFreeText, onOpenChange]);

  const handleBlur = useCallback(() => {
    if (!onFreeText || draft === null) return;
    onFreeText(draft.trim());
    setDraft(null);
  }, [draft, onFreeText]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      // The field lives inside a modal form; Enter must open the popup, not submit.
      event.preventDefault();
      open();
    },
    [open],
  );

  /**
   * An emptied input unsets the value straight away. Treating it as a draft instead would let
   * `close` restore the label the user had just deleted. Only a free-text field gets here.
   */
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const text = event.target.value;
      setDraft(text);
      if (!text.trim() && displayValue) onClear?.();
    },
    [displayValue, onClear],
  );

  const handleSelect = useCallback(
    (item: T) => {
      onSelect(item);
      setIsOpen(false);
      onOpenChange?.(false);
      setDraft(null);
      inputRef.current?.focus();
    },
    [onOpenChange, onSelect],
  );

  return (
    <>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={dialogId}
          aria-haspopup="dialog"
          autoComplete="off"
          readOnly={!acceptsFreeText}
          className={cn(
            "w-full rounded-md border border-border-secondary bg-surface-primary py-2 pl-3 text-sm text-text-primary outline-none transition-[border,box-shadow] focus:border-brand focus:shadow-[0_0_0_2px_rgba(26,42,94,0.07)] [font-family:inherit]",
            showClear ? "pr-16" : "pr-10",
            !acceptsFreeText && !disabled && "cursor-pointer",
            disabled &&
              "cursor-not-allowed bg-surface-secondary text-text-secondary",
            className,
          )}
          placeholder={placeholder}
          value={inputValue}
          disabled={disabled}
          onChange={acceptsFreeText ? handleChange : undefined}
          // A pick-only field opens its popup on click; a free-text one is typed into instead.
          onClick={acceptsFreeText ? undefined : open}
          onKeyDown={handleKeyDown}
          onBlur={acceptsFreeText ? handleBlur : undefined}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {showClear ? (
            <button
              type="button"
              title={t("clear")}
              aria-label={t("clear")}
              className="flex cursor-pointer items-center border-none bg-transparent pr-1.5 text-text-secondary hover:text-text-primary"
              onClick={onClear}
            >
              <Icon name="x" size={16} />
            </button>
          ) : null}
          <button
            type="button"
            title={t("search")}
            aria-label={t("search")}
            disabled={disabled}
            className="flex cursor-pointer items-center border-none bg-transparent text-text-secondary hover:text-text-primary disabled:cursor-not-allowed"
            onClick={open}
          >
            <Icon name="search" size={16} />
          </button>
        </div>
      </div>

      <RecordPickerDialog
        {...dialogProps}
        records={records}
        rowKey={rowKey}
        selectedKeys={selectedKeys}
        isRecordDisabled={isRecordDisabled}
        id={dialogId}
        isOpen={isOpen}
        onClose={close}
        onSelect={handleSelect}
        onSearchChange={onSearchChange}
      />
    </>
  );
}
