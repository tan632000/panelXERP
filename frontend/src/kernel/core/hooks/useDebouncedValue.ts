"use client";

import { useEffect, useRef, useState } from "react";

import { DEFAULT_FILTER_DEBOUNCE_MS } from "@/kernel/core/constants/list-ui";

interface UseDebouncedValueOptions {
  delay?: number;
  onDebounced?: () => void;
}

export function useDebouncedValue<T>(
  value: T,
  options: UseDebouncedValueOptions = {},
): T {
  const { delay = DEFAULT_FILTER_DEBOUNCE_MS, onDebounced } = options;
  const [debouncedValue, setDebouncedValue] = useState(value);
  const onDebouncedRef = useRef(onDebounced);

  useEffect(() => {
    onDebouncedRef.current = onDebounced;
  }, [onDebounced]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedValue((prev) => {
        if (Object.is(prev, value)) {
          return prev;
        }
        onDebouncedRef.current?.();
        return value;
      });
    }, delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);

  return debouncedValue;
}
