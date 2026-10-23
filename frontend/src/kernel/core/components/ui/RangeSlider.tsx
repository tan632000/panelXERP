"use client";

/** A labelled range input with its current value shown beside the label. */
export function RangeSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** The value as the reader should see it, e.g. `12°` or `150%`. */
  display?: string;
  hint?: string;
}) {
  return (
    <label className="block text-sm text-text-secondary">
      <span className="flex justify-between">
        {label}
        <span className="font-semibold text-text-primary">
          {display ?? value}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full cursor-pointer accent-brand"
      />
      {hint && (
        <span className="mt-0.5 block text-xs text-text-tertiary">{hint}</span>
      )}
    </label>
  );
}
