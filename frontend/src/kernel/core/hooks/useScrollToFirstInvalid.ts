"use client";

import { useCallback, useRef } from "react";

/** Controls that mark themselves invalid, in the two ways core components do it. */
const INVALID_SELECTOR = '[aria-invalid="true"],[data-invalid="true"]';

function isFocusable(node: Element): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  if (node.hasAttribute("disabled")) return false;
  return (
    node.matches("input,select,textarea,button,[tabindex]") ||
    node.isContentEditable
  );
}

/**
 * Brings the first invalid control of a form into view after a rejected submit.
 *
 * A form whose fields are all registered gets this from react-hook-form's own
 * `shouldFocusError`, which focuses the first errored ref. That falls silent for any value
 * written through `setValue` — a record picker, a catalog cell, anything without an input of
 * its own — and those are exactly the fields a long line editor is made of. The submit then
 * appears to do nothing at all: the error is rendered, but off-screen.
 *
 * So the search runs over the DOM rather than over the error object: whatever marked itself
 * `aria-invalid`/`data-invalid` is a control the reader has to reach, registered or not.
 *
 * Attach the returned ref to the element wrapping the fields, and pass `scrollToFirstInvalid`
 * as react-hook-form's invalid-submit handler: `handleSubmit(onValid, scrollToFirstInvalid)`.
 */
export function useScrollToFirstInvalid<T extends HTMLElement = HTMLElement>() {
  const containerRef = useRef<T | null>(null);

  const scrollToFirstInvalid = useCallback(() => {
    // The error nodes are rendered by the same commit that rejected the submit, so the read
    // waits for the next frame rather than racing it.
    requestAnimationFrame(() => {
      const root: ParentNode = containerRef.current ?? document;
      const target = root.querySelector(INVALID_SELECTOR);
      if (!target) return;

      target.scrollIntoView({ block: "center", behavior: "smooth" });
      // Focus after scrolling, and without letting the browser scroll again on its own.
      if (isFocusable(target)) {
        target.focus({ preventScroll: true });
      }
    });
  }, []);

  return { containerRef, scrollToFirstInvalid };
}
