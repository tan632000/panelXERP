"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import {
  applyThemeToDocument,
  mergeTheme,
} from "@kernel/core/theme/apply-theme";

import type { ErpTheme } from "@kernel/core/theme/theme.tokens";

interface ThemeContextValue {
  theme: ErpTheme;
  setTheme: (patch: Partial<ErpTheme>) => void;
  replaceTheme: (theme: ErpTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  theme: ErpTheme;
  children: React.ReactNode;
}

export function ThemeProvider({
  theme: initialTheme,
  children,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState(initialTheme);
  const [lastInitialTheme, setLastInitialTheme] = useState(initialTheme);

  if (initialTheme !== lastInitialTheme) {
    setLastInitialTheme(initialTheme);
    setThemeState(initialTheme);
  }

  useLayoutEffect(() => {
    applyThemeToDocument(theme, document.documentElement);
  }, [theme]);

  const setTheme = useCallback((patch: Partial<ErpTheme>) => {
    setThemeState((current) => mergeTheme(current, patch));
  }, []);

  const replaceTheme = useCallback((next: ErpTheme) => {
    setThemeState(next);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, replaceTheme }),
    [theme, setTheme, replaceTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
