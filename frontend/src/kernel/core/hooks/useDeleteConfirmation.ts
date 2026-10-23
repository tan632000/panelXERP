"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface DeleteConfirmation<TTarget> {
  /** The record awaiting confirmation, or `null` while the dialog is closed. */
  target: TTarget | null;
  isOpen: boolean;
  /** Opens the dialog for one record. */
  request: (target: TTarget) => void;
  /** Closes the dialog without deleting. */
  cancel: () => void;
  /** Runs the delete for the pending record. */
  confirm: () => void;
}

/**
 * Holds the "which record is about to be deleted" state that every list and detail page
 * needs, so a page only supplies the delete itself.
 *
 * The dialog is driven by the pending record rather than by a separate boolean, because the
 * confirmation text names the record: a page that tracked only "is the dialog open" had to
 * keep the record somewhere else anyway, and the two could disagree. `close` is handed to
 * the caller instead of being run for it, so the dialog stays up until the mutation settles
 * and a failure keeps the record on screen with its error.
 */
export function useDeleteConfirmation<TTarget>(
  onConfirm: (target: TTarget, close: () => void) => void,
): DeleteConfirmation<TTarget> {
  const [target, setTarget] = useState<TTarget | null>(null);

  // Kept in a ref so `confirm` has a stable identity even though pages pass an inline
  // callback that closes over the mutation and is therefore new on every render.
  const onConfirmRef = useRef(onConfirm);
  useEffect(() => {
    onConfirmRef.current = onConfirm;
  });

  const request = useCallback((next: TTarget) => setTarget(next), []);
  const cancel = useCallback(() => setTarget(null), []);
  const close = useCallback(() => setTarget(null), []);

  const confirm = useCallback(() => {
    if (target === null) return;
    onConfirmRef.current(target, close);
  }, [target, close]);

  return { target, isOpen: target !== null, request, cancel, confirm };
}
