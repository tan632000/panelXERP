"use client";

import { useSyncExternalStore } from "react";

/** Nothing to subscribe to: device capabilities do not change while the page is open. */
const subscribe = () => () => {};

/**
 * Whether this device can open a camera stream — false on the server and in browsers without
 * `getUserMedia`. It only proves the API exists; a permission denial still surfaces at scan time.
 */
export function useCameraAvailable(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof navigator.mediaDevices?.getUserMedia === "function",
    () => false,
  );
}
