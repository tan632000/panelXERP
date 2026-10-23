"use client";

import { createContext, useContext } from "react";

/** How a page header reaches the module shell's phone drawer. */
export interface MobileNav {
  open: () => void;
}

/**
 * Provided by `ModuleShell`. Absent outside a module (the sign-in screens), where there is no
 * sidebar to open, so the menu button renders nothing there.
 */
export const MobileNavContext = createContext<MobileNav | null>(null);

export function useMobileNav(): MobileNav | null {
  return useContext(MobileNavContext);
}
