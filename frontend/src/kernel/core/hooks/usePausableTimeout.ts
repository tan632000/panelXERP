"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function usePausableTimeout(callback: () => void, durationMs: number) {
  const remainingMsRef = useRef(durationMs);
  const startedAtRef = useRef(0);
  const timeoutIdRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const callbackRef = useRef(callback);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const clearTimer = useCallback(() => {
    if (timeoutIdRef.current === null) return;
    window.clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = null;
  }, []);

  const arm = useCallback(
    (ms: number) => {
      clearTimer();
      startedAtRef.current = Date.now();
      timeoutIdRef.current = window.setTimeout(() => {
        timeoutIdRef.current = null;
        callbackRef.current();
      }, ms);
    },
    [clearTimer],
  );

  useEffect(() => {
    arm(remainingMsRef.current);
    return clearTimer;
  }, [arm, clearTimer]);

  const pause = useCallback(() => {
    if (pausedRef.current || timeoutIdRef.current === null) return;
    pausedRef.current = true;
    remainingMsRef.current = Math.max(
      0,
      remainingMsRef.current - (Date.now() - startedAtRef.current),
    );
    clearTimer();
    setPaused(true);
  }, [clearTimer]);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    arm(remainingMsRef.current);
  }, [arm]);

  return { paused, pause, resume };
}
