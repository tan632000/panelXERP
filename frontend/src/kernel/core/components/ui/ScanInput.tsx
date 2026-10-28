"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";

export interface ScanInputProps<TResult> {
  /** Looks the scanned value up; a rejection is shown as `errorMessage(error)`. */
  resolve: (value: string) => Promise<TResult>;
  /** Called with the answer to the newest scan only; older answers arriving late are dropped. */
  onResult: (result: TResult, scanned: string) => void;
  /** The sentence shown under the field when the lookup rejects (e.g. not found). */
  errorMessage: (error: unknown) => string;
  placeholder?: string;
  ariaLabel?: string;
  /** The host says no scan can be taken right now. */
  disabled?: boolean;
  className?: string;
}

/**
 * A field a keyboard-wedge scanner types into: the scanner sends the code and then Enter.
 * It takes the focus, submits the trimmed value once per Enter, and is emptied for the next
 * scan so two reads never run together. There is no camera.
 */
export function ScanInput<TResult>({
  resolve,
  onResult,
  errorMessage,
  placeholder,
  ariaLabel,
  disabled = false,
  className,
}: Readonly<ScanInputProps<TResult>>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Only the newest scan may touch the field; an older answer arriving late is dropped. */
  const scanSeq = useRef(0);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  // An answer arriving after the field is gone must not reach the host.
  useEffect(() => {
    const seq = scanSeq;
    return () => {
      seq.current += 1;
    };
  }, []);

  const submit = async () => {
    const scanned = value.trim();
    if (!scanned || disabled) return;
    scanSeq.current += 1;
    const seq = scanSeq.current;
    // Emptied at once: a scanner's next read must not append to this one while it resolves.
    setValue("");
    setError(null);
    try {
      const result = await resolve(scanned);
      if (seq !== scanSeq.current) return;
      onResult(result, scanned);
    } catch (failure: unknown) {
      if (seq !== scanSeq.current) return;
      setError(errorMessage(failure));
    } finally {
      if (seq === scanSeq.current) inputRef.current?.focus();
    }
  };

  return (
    <div className={cn("flex min-w-[150px] max-w-[300px] flex-col", className)}>
      <div
        className={cn(
          "flex h-9 min-h-9 items-center gap-1.5 rounded-[7px] border bg-surface-primary px-2.5 text-text-tertiary transition-[border-color,box-shadow] hover:border-border-primary",
          "focus-within:border-brand focus-within:text-brand focus-within:shadow-[0_0_0_3px_rgba(26,42,94,0.08)] max-lg:h-10 max-lg:min-h-10",
          error ? "border-danger-text" : "border-border-secondary",
        )}
      >
        <Icon name="qrcode" size={16} />
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          className="w-full border-none bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary disabled:cursor-default [font-family:inherit]"
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void submit();
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
