"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@kernel/core/lib/cn";
import {
  formatNumberForInput,
  parseNumberInputValue,
} from "@kernel/core/lib/formatters";

import type { NumberInputParseOptions } from "@kernel/core/lib/formatters";
import type {
  ChangeEvent,
  CompositionEvent,
  FocusEvent,
  InputHTMLAttributes,
  Ref,
} from "react";

export interface NumberInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange"
> {
  error?: boolean;
  value?: string | number | null;
  defaultValue?: string | number | null;
  /** Receives the stored form of the value in `event.target.value` (`"1234.56"`). */
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  /** The same value already typed as a number, so a caller never coerces by hand. */
  onValueChange?: (value: number | null) => void;
  /** Hard cap on decimal digits. `0` makes the field integer-only. */
  decimalScale?: number;
  allowNegative?: boolean;
}

/**
 * Bare numeric input, styled exactly like the `FormInput` control but without a label.
 *
 * `FormInput` owns its own label and error line, which does not fit a row where a number
 * shares one label with a neighbouring control — a value plus its unit, for example. This
 * renders the control alone, for use inside `FormControl`.
 *
 * The field is a masked text control, not `type="number"`: browsers refuse to show grouping
 * separators inside a number input, and the customer requires every quantity, price, discount
 * and freight cost to read `1.234.567,89` while it is being typed. Two forms therefore exist
 * at once — the display above, and the stored form (`1234567.89`) handed to `onChange`,
 * `onValueChange` and to whatever reads the input `ref`, so callers keep storing numbers.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    {
      error,
      className,
      readOnly,
      value,
      defaultValue,
      onChange,
      onValueChange,
      onBlur,
      decimalScale,
      allowNegative = true,
      step,
      ...props
    },
    ref,
  ) {
    // Decimals stay open unless a caller asks for an integer field outright: a `step` of 1 is
    // how a column declares its spinner increment, not a rule about what may be typed, and
    // reading it as one would silently swallow the decimal comma.
    const parseOptions: NumberInputParseOptions = {
      allowDecimal: decimalScale !== 0,
      decimalScale,
      allowNegative,
    };
    const optionsRef = useRef(parseOptions);
    optionsRef.current = parseOptions;

    const initial = formatNumberForInput(value ?? defaultValue, parseOptions);
    const [display, setDisplay] = useState(initial.display);
    const canonicalRef = useRef(initial.canonical);
    const caretRef = useRef<number | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    /**
     * What the field held when the input method opened its buffer, and where the caret was.
     * `null` whenever no composition is open.
     *
     * An input method — a Vietnamese keyboard on Linux, Japanese or Korean anywhere — keeps the
     * word being typed in a buffer of its own and rewrites the field from that buffer on every
     * keystroke. Regrouping the text underneath it desynchronises the two, and the method then
     * re-inserts everything it believes it has already typed: `1234` followed by `5` landed as
     * `123412345`. The text in the field is therefore not to be trusted while a buffer is open.
     * The event says what the method has composed so far, so the value is rebuilt from the text
     * that was there before it opened plus that — which lets the mask keep grouping on every
     * keystroke instead of waiting for the word to be committed.
     */
    const compositionRef = useRef<{
      text: string;
      start: number;
      end: number;
    } | null>(null);

    // A controlled caller owns the value, but only when it actually differs: reformatting on
    // every render would eat the half-typed states (`1.234,`) the mask has to preserve.
    useEffect(() => {
      if (value === undefined || compositionRef.current) return;
      const parts = formatNumberForInput(value, optionsRef.current);
      if (parts.canonical !== canonicalRef.current) {
        canonicalRef.current = parts.canonical;
        setDisplay(parts.display);
      }
    }, [value]);

    useCaretEffect(() => {
      const node = inputRef.current;
      const caret = caretRef.current;
      caretRef.current = null;
      // Moving the caret mid-composition is the other half of the same desynchronisation.
      if (compositionRef.current) return;
      if (node && caret != null && document.activeElement === node) {
        node.setSelectionRange(caret, caret);
      }
    }, [display]);

    const attachRef = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        // React Hook Form writes straight to the DOM node on `reset`/`setValue`, in the stored
        // form. The handle it holds converts in both directions so a programmatic write lands
        // formatted on screen and a read still returns the number.
        const handle = node
          ? new Proxy(node, {
              // Every read and write goes to the node itself, never through the proxy as
              // receiver: a DOM accessor invoked with a proxy for `this` throws.
              get(target, prop) {
                if (prop === "value") return canonicalRef.current;
                const member = Reflect.get(target, prop);
                return typeof member === "function"
                  ? member.bind(target)
                  : member;
              },
              set(target, prop, next) {
                if (prop !== "value") {
                  return Reflect.set(target, prop, next);
                }
                const parts = formatNumberForInput(
                  next as string,
                  optionsRef.current,
                );
                // A write that carries the value the field already holds must not touch the
                // text: re-registering a field writes its own value back, and reformatting it
                // would drop the decimal comma the user has just typed but not yet filled in.
                if (parts.canonical !== canonicalRef.current) {
                  canonicalRef.current = parts.canonical;
                  setDisplay(parts.display);
                }
                return true;
              },
            })
          : null;
        assignRef(ref, handle);
      },
      [ref],
    );

    /** Masks the text, moves the caret to match and tells the caller the stored value. */
    const applyTypedValue = (
      event: ChangeEvent<HTMLInputElement> | CompositionEvent<HTMLInputElement>,
      text: string,
      caret: number | null,
    ) => {
      const raw = replaceLoneZero(display, withTypedDecimal(display, text));
      const parts = parseNumberInputValue(raw, optionsRef.current);
      canonicalRef.current = parts.canonical;
      caretRef.current = caretAfterFormat(
        raw,
        caret ?? raw.length,
        parts.display,
      );
      setDisplay(parts.display);
      onChange?.(
        withCanonicalValue(
          event as unknown as ChangeEvent<HTMLInputElement>,
          parts.canonical,
        ),
      );
      onValueChange?.(parts.numeric);
    };

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      const composed = composedText(compositionRef.current, event.nativeEvent);
      if (composed !== null) {
        // The method's buffer, not the field's text: grouping still happens on this keystroke,
        // but from a value the method cannot have duplicated.
        applyTypedValue(event, composed, null);
        return;
      }
      applyTypedValue(event, event.target.value, event.target.selectionStart);
    };

    const handleCompositionStart = (
      event: CompositionEvent<HTMLInputElement>,
    ) => {
      const node = event.currentTarget;
      compositionRef.current = {
        text: display,
        start: node.selectionStart ?? display.length,
        end: node.selectionEnd ?? display.length,
      };
      props.onCompositionStart?.(event);
    };

    const handleCompositionEnd = (
      event: CompositionEvent<HTMLInputElement>,
    ) => {
      const base = compositionRef.current;
      compositionRef.current = null;
      // `compositionend` carries the committed word, so the value settles on the same rebuild
      // the keystrokes used rather than on whatever the method left in the field.
      const committed =
        base && typeof event.data === "string"
          ? spliceComposition(base, event.data)
          : event.currentTarget.value;
      applyTypedValue(event, committed, null);
      props.onCompositionEnd?.(event);
    };

    const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
      // Leaving the field ends any buffer the method still had open; without this the mask
      // would settle the text while the field still claimed a composition was in progress.
      compositionRef.current = null;
      // Settles a half-typed value: `1.234,` reads back as `1.234`.
      setDisplay(
        formatNumberForInput(canonicalRef.current, optionsRef.current).display,
      );
      onBlur?.(withCanonicalValue(event, canonicalRef.current));
    };

    return (
      <input
        ref={attachRef}
        type="text"
        inputMode={parseOptions.allowDecimal ? "decimal" : "numeric"}
        autoComplete="off"
        className={cn(
          "w-full rounded-md border border-border-secondary bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none transition-[border,box-shadow] focus:border-brand focus:shadow-[0_0_0_2px_rgba(26,42,94,0.07)] [font-family:inherit]",
          error && "border-danger-text focus:border-danger-text",
          (readOnly || props.disabled) &&
            "cursor-not-allowed bg-surface-secondary text-text-secondary",
          className,
        )}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        step={step}
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
        {...props}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />
    );
  },
);

/** The text before the method opened its buffer, with what it has composed spliced back in. */
function spliceComposition(
  base: { text: string; start: number; end: number },
  data: string,
): string {
  return base.text.slice(0, base.start) + data + base.text.slice(base.end);
}

/**
 * What the input method has composed so far, or `null` when no buffer is open and the field's
 * own text can be trusted.
 *
 * `insertCompositionText` carries the whole buffer in `data`, not just the last keystroke, so
 * splicing it over the text that preceded the composition reproduces exactly what the actor
 * has typed — however many times the method has rewritten the field in the meantime. A method
 * that reports no data (a backspace inside the buffer, say) falls back to reading the field.
 */
function composedText(
  base: { text: string; start: number; end: number } | null,
  native: Event,
): string | null {
  if (!base) return null;
  const data = (native as InputEvent).data;
  if (typeof data !== "string") return null;
  return spliceComposition(base, data);
}

/**
 * The caret has to be restored before the browser paints, but a layout effect has nothing to
 * do while the page is being rendered on the server — and React warns when one is declared
 * there.
 */
const useCaretEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function assignRef(ref: Ref<HTMLInputElement>, node: HTMLInputElement | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) (ref as React.MutableRefObject<unknown>).current = node;
}

/** Same event, except every reader of `target.value` sees the stored form. */
function withCanonicalValue<E extends { target: EventTarget }>(
  event: E,
  canonical: string,
): E {
  const target = new Proxy(event.target as HTMLInputElement, {
    get(node, prop) {
      if (prop === "value") return canonical;
      const member = Reflect.get(node, prop);
      return typeof member === "function" ? member.bind(node) : member;
    },
  });
  return new Proxy(event, {
    get(source, prop) {
      if (prop === "target" || prop === "currentTarget") return target;
      const member = Reflect.get(source, prop);
      return typeof member === "function" ? member.bind(source) : member;
    },
  });
}

/** A number already carrying its grouping dots: `1.234`, `12.345.678`. */
const GROUPED_NUMBER = /^-?\d{1,3}(\.\d{3})+$/;

/**
 * Where the text the actor has just inserted sits inside the new value, or `null` when the
 * field did not grow — a deletion, or a selection typed over, which neither of the callers
 * below has anything to say about.
 */
function insertedSlice(
  previous: string,
  raw: string,
): { start: number; end: number } | null {
  if (raw.length <= previous.length) return null;
  let start = 0;
  while (start < previous.length && previous[start] === raw[start]) start += 1;
  let end = 0;
  while (
    end < previous.length - start &&
    previous[previous.length - 1 - end] === raw[raw.length - 1 - end]
  ) {
    end += 1;
  }
  return { start, end };
}

/**
 * Types over a field holding nothing but `0` instead of typing beside it.
 *
 * A lone `0` is what a money or percentage cell shows when nothing has been entered, and the
 * caret lands in front of it as often as behind it — so a typed `5` read as `50` a third of
 * the time. The zero carries no information of its own, so digits typed anywhere in such a
 * field replace it outright. A typed comma does not: `0,5` has to stay reachable.
 */
function replaceLoneZero(previous: string, raw: string): string {
  if (previous !== "0" && previous !== "-0") return raw;
  const slice = insertedSlice(previous, raw);
  if (!slice) return raw;
  const inserted = raw.slice(slice.start, raw.length - slice.end);
  if (!/^\d+$/.test(inserted)) return raw;
  return (previous.startsWith("-") ? "-" : "") + inserted;
}

/**
 * Reads a dot the user just typed as the decimal separator.
 *
 * Dots on screen are the mask's own grouping and have to be dropped when the text is parsed,
 * but the key beside the numeric keypad types that same character — so a dot is only grouping
 * when it was already there. Comparing the text against what the field last displayed says
 * exactly what was inserted, so the keystroke is honoured while the mask's dots are not.
 */
function withTypedDecimal(previous: string, raw: string): string {
  const slice = insertedSlice(previous, raw);
  if (!slice) return raw;
  const { start, end } = slice;
  const inserted = raw.slice(start, raw.length - end);
  const separators = inserted.match(/[.,]/g);
  // A pasted `1.234` is a grouped number; a pasted `1234.56` and a typed `.` are decimals.
  if (separators?.length !== 1 || GROUPED_NUMBER.test(inserted)) return raw;
  return (
    raw.slice(0, start) +
    inserted.replace(/[.,]/, ",") +
    raw.slice(raw.length - end)
  );
}

/**
 * Keeps the caret next to the same character after the mask has re-grouped the text around it.
 *
 * The decimal comma counts as much as a digit: a caret parked before it instead of after it
 * would send the next keystroke into the integer part, so a decimal could never be typed.
 */
function caretAfterFormat(raw: string, caret: number, display: string): number {
  const kept = /[\d,]/;
  let before = 0;
  for (let index = 0; index < caret && index < raw.length; index += 1) {
    if (kept.test(raw[index])) before += 1;
  }
  if (before === 0) return 0;
  let seen = 0;
  for (let index = 0; index < display.length; index += 1) {
    if (kept.test(display[index])) {
      seen += 1;
      if (seen === before) return index + 1;
    }
  }
  return display.length;
}
