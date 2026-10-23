"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  isListViewUrlSnapshot,
  readListViewUrlValue,
  retainListViewUrlKey,
  readListViewValue,
  writeListViewUrlValue,
  writeListViewValue,
  type ListViewValueCheck,
} from "@/kernel/core/lib/list-view-state";
import { usePathname } from "@/kernel/i18n/navigation";

/**
 * The storage scope of the list being rendered. Every filter hook on the screen shares it, so
 * a list re-opens with all of its filters however the reader comes back to it — from one of
 * its records, from another screen or from the menu — for as long as the browser tab lives.
 *
 * `scopeOverride` lets a screen whose tabs are separate routes still share one scope — e.g. MRP's
 * List and Balance tabs sit over one toolbar, so a route split between them must not split their
 * filters too. Omit it to scope by pathname, which is what a screen with one route wants.
 */
export function useListViewScope(scopeOverride?: string): string {
  const pathname = usePathname();
  return scopeOverride ?? pathname;
}

interface UseListViewStateOptions {
  /** See {@link useListViewScope}. */
  scope?: string;
  /**
   * Rejects a value a link or this tab hands back that the screen cannot render — a period
   * missing its dates, a tab that does not exist. A rejected value falls back to the default.
   */
  isValid?: ListViewValueCheck;
}

/**
 * `useState` for one filter of a list, kept while the reader visits other screens in this tab
 * and mirrored into the URL, so a copied link opens the list with the same filter.
 *
 * On mount a value in the URL wins over the one this tab kept: whoever opens a shared link
 * sees what its sender saw. A URL that is a whole view (see `isListViewUrlSnapshot`) also
 * means a key it lacks is at its default. Otherwise the kept value comes back and is written
 * to the URL.
 *
 * `key` names the filter within its list and is its URL parameter; two tabs of the same screen
 * need two names. Passing no key gives plain component state, which is what a screen outside
 * a list wants.
 */
export function useListViewState<T>(
  key: string | undefined,
  initialValue: T,
  options?: UseListViewStateOptions,
): [T, Dispatch<SetStateAction<T>>] {
  const scope = useListViewScope(options?.scope);
  // The default decides how the URL spells the value and when it drops it; the first one counts.
  const defaultRef = useRef(initialValue);
  const isValid = options?.isValid;
  const [value, setValue] = useState<T>(() => {
    if (key === undefined) return initialValue;
    const shared = readListViewUrlValue(key, initialValue, isValid);
    if (shared !== undefined) {
      writeListViewValue(scope, key, shared);
      return shared;
    }
    if (isListViewUrlSnapshot()) {
      writeListViewValue(scope, key, initialValue);
      return initialValue;
    }
    const kept = readListViewValue(scope, key, initialValue);
    return !isValid || isValid(kept) ? kept : initialValue;
  });

  // Puts a value restored from this tab back into the URL, so the link is shareable at once,
  // and takes it out again when the filter leaves the screen (a tab switched away from).
  const mountedValueRef = useRef(value);
  useEffect(() => {
    if (key === undefined) return undefined;
    writeListViewUrlValue(key, mountedValueRef.current, defaultRef.current);
    return retainListViewUrlKey(key);
  }, [key]);

  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      setValue((current) => {
        const resolved =
          typeof next === "function" ? (next as (prev: T) => T)(current) : next;
        if (key !== undefined) {
          writeListViewValue(scope, key, resolved);
          writeListViewUrlValue(key, resolved, defaultRef.current);
        }
        return resolved;
      });
    },
    [key, scope],
  );

  return [value, set];
}
