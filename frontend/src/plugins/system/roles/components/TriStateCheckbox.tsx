"use client";

import { useEffect, useRef } from "react";

/**
 * A checkbox that can also stand for "some of them", which HTML expresses only through a
 * property, never an attribute — so it cannot be written in JSX alone.
 */
export function TriStateCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  ariaLabel,
  title,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
  ariaLabel: string;
  /** Hover text — the scope's full name, which a column header alone cannot carry. */
  title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = Boolean(indeterminate) && !checked;
    }
  }, [indeterminate, checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={ariaLabel}
      title={title}
      className="size-4 cursor-pointer accent-brand disabled:cursor-not-allowed"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
  );
}
