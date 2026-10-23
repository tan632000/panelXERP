"use client";

import { useTranslations } from "next-intl";

import { SIGNATURE_PEN_COLORS } from "@/kernel/core/auth/signature-image";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";

import type { SignaturePen } from "@/kernel/core/auth/signature-image";
import type { ReactNode } from "react";

/** The value that keeps a photographed signature's own ink colour. */
export const ORIGINAL_INK = "original";

const RAINBOW =
  "conic-gradient(#ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)";

function Swatch({
  label,
  selected,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const className = cn(
    "relative inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 bg-surface-primary transition",
    selected
      ? "border-brand"
      : "border-transparent hover:border-border-secondary",
  );
  // The custom colour is a label wrapping a colour input, so the whole swatch opens the picker.
  return onClick ? (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      title={label}
      aria-label={label}
      onClick={onClick}
      className={className}
    >
      {children}
    </button>
  ) : (
    <label title={label} className={className}>
      {children}
    </label>
  );
}

/**
 * The signature's pen colours, the same set whether the signature is drawn or photographed,
 * plus any other colour through the browser's picker. A photo may also keep its own ink. The
 * swatches sit on one row, with the chosen colour named beneath.
 */
export function InkColorPicker({
  value,
  onChange,
  allowOriginal = false,
}: {
  /** A `#rrggbb` colour, or `ORIGINAL_INK` when `allowOriginal` is set. */
  value: string;
  onChange: (value: string) => void;
  allowOriginal?: boolean;
}) {
  const t = useTranslations("auth");
  const pens = Object.keys(SIGNATURE_PEN_COLORS) as SignaturePen[];
  const selectedPen = pens.find((key) => SIGNATURE_PEN_COLORS[key] === value);
  const isCustom = value !== ORIGINAL_INK && !selectedPen;
  let selectedLabel = t("signature.pen.custom");
  if (value === ORIGINAL_INK) selectedLabel = t("signature.pen.original");
  else if (selectedPen) selectedLabel = t(`signature.pen.${selectedPen}`);

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={t("signature.inkColor")}
        className="flex flex-wrap items-center gap-1"
      >
        {allowOriginal && (
          <Swatch
            label={t("signature.pen.original")}
            selected={value === ORIGINAL_INK}
            onClick={() => onChange(ORIGINAL_INK)}
          >
            <span className="inline-flex size-4 items-center justify-center rounded-full bg-surface-secondary text-text-secondary ring-1 ring-border-secondary">
              <Icon name="photo" size={10} />
            </span>
          </Swatch>
        )}
        {pens.map((key) => (
          <Swatch
            key={key}
            label={t(`signature.pen.${key}`)}
            selected={selectedPen === key}
            onClick={() => onChange(SIGNATURE_PEN_COLORS[key])}
          >
            <span
              className="size-4 rounded-full"
              style={{ backgroundColor: SIGNATURE_PEN_COLORS[key] }}
            />
          </Swatch>
        ))}
        <Swatch label={t("signature.pen.custom")} selected={isCustom}>
          <span
            className="size-4 rounded-full"
            style={{ background: isCustom ? value : RAINBOW }}
          />
          <input
            type="color"
            aria-label={t("signature.pen.custom")}
            value={isCustom ? value : SIGNATURE_PEN_COLORS.black}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </Swatch>
      </div>
      <p className="mt-1.5 text-xs text-text-tertiary">
        {t("signature.pen.selected", { color: selectedLabel })}
      </p>
    </div>
  );
}
