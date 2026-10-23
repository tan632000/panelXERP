import {
  THEME_CSS_VAR_MAP,
  type ErpTheme,
} from "@kernel/core/theme/theme.tokens";

export function themeToCssProperties(theme: ErpTheme): Record<string, string> {
  const entries = Object.entries(THEME_CSS_VAR_MAP) as Array<
    [keyof ErpTheme, string]
  >;
  return Object.fromEntries(
    entries.map(([key, cssVar]) => [cssVar, theme[key]]),
  );
}

/** SSR: inject once in root layout to avoid theme flash */
export function themeToCssBlock(theme: ErpTheme): string {
  const props = themeToCssProperties(theme);
  const lines = Object.entries(props).map(
    ([name, value]) => `  ${name}: ${value};`,
  );
  return `:root {\n${lines.join("\n")}\n}`;
}

export function applyThemeToDocument(
  theme: ErpTheme,
  target: HTMLElement,
): void {
  const props = themeToCssProperties(theme);
  for (const [name, value] of Object.entries(props)) {
    target.style.setProperty(name, value);
  }
}

export function mergeTheme(base: ErpTheme, patch: Partial<ErpTheme>): ErpTheme {
  return { ...base, ...patch };
}
