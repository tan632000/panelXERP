"use client";

import { useTranslations } from "next-intl";
import React, { useRef } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { ModalScopeContext } from "@/kernel/core/components/ui/modal-scope-context";
import { useCardTableLabels } from "@/kernel/core/hooks/useCardTableLabels";
import { usePhoneViewport } from "@/kernel/core/hooks/usePhoneViewport";
import { usePortalContainer } from "@/kernel/core/hooks/usePortalContainer";
import { cn } from "@/kernel/core/lib/cn";
import { isEditableLineTable } from "@/kernel/core/lib/detail-table-cards";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  submitLabel?: string;
  cancelLabel?: string;
  showFooter?: boolean;
  wide?: boolean;
  extraWide?: boolean;
  /** Explicit width class for a modal that fits neither preset, e.g. `w-[900px]`. */
  widthClassName?: string;
  submitDisabled?: boolean;
  /** Icon of the submit button; a confirm check unless the action has its own glyph. */
  submitIcon?: string;
  /** Renders the footer with only the cancel/close button — used for fully locked records. */
  hideSubmit?: boolean;
  /** An alternative to the submit button, rendered beside it — e.g. a second way to save. */
  secondaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
}

/** A form line's only action is its remove button, which keeps its icon on a card. */
const noActionLabel = () => undefined;

function presetWidthClass(wide: boolean, extraWide: boolean): string {
  if (extraWide) return "w-[1080px]";
  if (wide) return "w-[760px]";
  return "w-[600px]";
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  onSubmit,
  submitLabel,
  cancelLabel,
  showFooter = true,
  wide = false,
  extraWide = false,
  widthClassName,
  submitDisabled = false,
  submitIcon = "check",
  hideSubmit = false,
  secondaryAction,
}: ModalProps) {
  const t = useTranslations("common");
  // Rendered into the body rather than in place: a modal opened from inside another modal's
  // form would otherwise nest one form in the other, and its confirm button would belong to
  // the outer form — submitting the record behind it instead of confirming the picker.
  const container = usePortalContainer();
  const isPhone = usePhoneViewport();
  const bodyRef = useRef<HTMLDivElement>(null);
  // On a phone or a tablet a line editor reads as one card of captioned fields per line
  // (`[data-form-cards]` in `globals.css`) instead of a table scrolled sideways.
  const lineCards = isPhone && isOpen && Boolean(container);
  useCardTableLabels(
    bodyRef,
    lineCards,
    noActionLabel,
    isEditableLineTable,
    true,
  );

  if (!isOpen || !container) return null;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A modal opened from inside another modal's form is nested in it, and React propagates
    // submit along its own tree — so without this the inner confirm also submits the outer
    // form, saving a record the reader never asked to save.
    e.stopPropagation();
    if (onSubmit) {
      onSubmit(e);
    } else {
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
      <div
        className={cn(
          "flex max-h-[92vh] max-w-[96vw] flex-col rounded-xl border border-border-secondary bg-surface-primary shadow-[0_20px_60px_rgba(0,0,0,0.15)]",
          // `cn` only joins classes, so exactly one width class may be emitted.
          widthClassName ?? presetWidthClass(wide, extraWide),
          // A phone gets the whole screen: a dialog sized for a desktop either overflows it or
          // leaves a strip too narrow to type in. `!` beats whatever width the caller asked for.
          "max-lg:h-dvh max-lg:max-h-none max-lg:w-full! max-lg:max-w-none! max-lg:rounded-none max-lg:border-0",
        )}
      >
        <form
          noValidate
          onSubmit={handleFormSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border-secondary px-[18px] pb-[11px] pt-3.5 max-lg:gap-2 max-lg:py-1.5 max-lg:pl-4 max-lg:pr-1.5">
            <span className="text-sm font-bold text-text-primary max-lg:text-[15px]">
              {title}
            </span>
            <button
              type="button"
              className="flex cursor-pointer border-none bg-transparent p-0 text-2xl leading-none text-text-secondary hover:text-text-primary max-lg:size-11 max-lg:shrink-0 max-lg:items-center max-lg:justify-center"
              onClick={onClose}
            >
              <Icon name="x" size={19} />
            </button>
          </div>
          <div
            ref={bodyRef}
            data-form-cards={lineCards ? "" : undefined}
            className="scrollbar-thin flex-1 overflow-y-auto px-[18px] py-4 max-lg:px-4"
          >
            <ModalScopeContext.Provider value>
              {children}
            </ModalScopeContext.Provider>
          </div>
          {showFooter && (
            <div className="flex shrink-0 justify-end gap-[7px] border-t border-border-secondary px-[18px] py-[11px] max-lg:flex-wrap max-lg:px-4 max-lg:pb-4 max-lg:[&>button]:min-h-11 max-lg:[&>button]:flex-1 max-lg:[&>button]:justify-center">
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-[7px] border border-border-secondary bg-surface-primary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50 [font-family:inherit]"
                onClick={onClose}
              >
                {cancelLabel ?? t("cancel")}
              </button>
              {secondaryAction && (
                <button
                  type="button"
                  disabled={secondaryAction.disabled}
                  className="inline-flex cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-[7px] border border-brand bg-surface-primary px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50 [font-family:inherit]"
                  onClick={secondaryAction.onClick}
                >
                  {secondaryAction.label}
                </button>
              )}
              {!hideSubmit && (
                <button
                  type="submit"
                  disabled={submitDisabled}
                  className="inline-flex cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-[7px] border border-brand bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 [font-family:inherit]"
                >
                  <Icon name={submitIcon} size={16} />
                  {submitLabel ?? t("save")}
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>,
    container,
  );
}
