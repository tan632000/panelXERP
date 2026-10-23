import { mergeTheme } from "@kernel/core/theme/apply-theme";
import {
  DEFAULT_ERP_THEME,
  type ErpTheme,
  type ThemeProfileInput,
} from "@kernel/core/theme/theme.tokens";

function orThemeColor(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function pickColor(
  ...candidates: Array<string | undefined>
): string | undefined {
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/** Map profile/YAML-style keys → ErpTheme patch */
export function themeProfileToPatch(
  profile: ThemeProfileInput,
): Partial<ErpTheme> {
  const patch: Partial<ErpTheme> = {};

  const primary = pickColor(profile.primary_color);
  const primaryHover = pickColor(profile.primary_hover);
  const primaryLight = pickColor(profile.primary_light);
  const sidebarBg = pickColor(profile.sidebar_bg);
  const sidebarText = pickColor(profile.sidebar_text);
  const sidebarTextMuted = pickColor(profile.sidebar_text_muted);
  const surfaceBg = pickColor(profile.surface_bg);

  if (primary) patch.brand = orThemeColor(primary, DEFAULT_ERP_THEME.brand);
  if (primaryHover) {
    patch.brandHover = orThemeColor(primaryHover, DEFAULT_ERP_THEME.brandHover);
  }
  if (primaryLight) {
    patch.brandLight = orThemeColor(primaryLight, DEFAULT_ERP_THEME.brandLight);
  }
  if (sidebarBg) {
    patch.sidebarBg = orThemeColor(sidebarBg, DEFAULT_ERP_THEME.sidebarBg);
  }
  if (sidebarText) {
    patch.sidebarText = orThemeColor(
      sidebarText,
      DEFAULT_ERP_THEME.sidebarText,
    );
  }
  if (sidebarTextMuted) {
    patch.sidebarTextMuted = orThemeColor(
      sidebarTextMuted,
      DEFAULT_ERP_THEME.sidebarTextMuted,
    );
  }
  if (surfaceBg) {
    patch.surfaceTertiary = orThemeColor(
      surfaceBg,
      DEFAULT_ERP_THEME.surfaceTertiary,
    );
  }

  return patch;
}

export function resolveThemeFromProfile(
  profile: ThemeProfileInput,
  base: ErpTheme = DEFAULT_ERP_THEME,
): ErpTheme {
  return mergeTheme(base, themeProfileToPatch(profile));
}

/**
 * Resolve theme from NEXT_PUBLIC_THEME_* (build-time / per-customer deploy).
 * Supports alias keys: PRIMARY_COLOR, SIDEBAR_BG, SURFACE_BG, …
 * Direct process.env references required for Next.js client inlining.
 */
export function resolveThemeFromEnv(
  base: ErpTheme = DEFAULT_ERP_THEME,
): ErpTheme {
  const profile: ThemeProfileInput = {
    primary_color: pickColor(
      process.env.NEXT_PUBLIC_THEME_PRIMARY_COLOR,
      process.env.NEXT_PUBLIC_THEME_BRAND,
    ),
    primary_hover: pickColor(
      process.env.NEXT_PUBLIC_THEME_PRIMARY_HOVER,
      process.env.NEXT_PUBLIC_THEME_BRAND_HOVER,
    ),
    primary_light: pickColor(
      process.env.NEXT_PUBLIC_THEME_PRIMARY_LIGHT,
      process.env.NEXT_PUBLIC_THEME_BRAND_LIGHT,
    ),
    sidebar_bg: process.env.NEXT_PUBLIC_THEME_SIDEBAR_BG,
    sidebar_text: process.env.NEXT_PUBLIC_THEME_SIDEBAR_TEXT,
    sidebar_text_muted: process.env.NEXT_PUBLIC_THEME_SIDEBAR_TEXT_MUTED,
    surface_bg: pickColor(
      process.env.NEXT_PUBLIC_THEME_SURFACE_BG,
      process.env.NEXT_PUBLIC_THEME_SURFACE_TERTIARY,
    ),
  };

  let theme = resolveThemeFromProfile(profile, base);

  theme = mergeTheme(theme, {
    brand50: orThemeColor(
      process.env.NEXT_PUBLIC_THEME_BRAND_50,
      theme.brand50,
    ),
    brand100: orThemeColor(
      process.env.NEXT_PUBLIC_THEME_BRAND_100,
      theme.brand100,
    ),
    surfacePrimary: orThemeColor(
      process.env.NEXT_PUBLIC_THEME_SURFACE_PRIMARY,
      theme.surfacePrimary,
    ),
    surfaceSecondary: orThemeColor(
      process.env.NEXT_PUBLIC_THEME_SURFACE_SECONDARY,
      theme.surfaceSecondary,
    ),
    textPrimary: orThemeColor(
      process.env.NEXT_PUBLIC_THEME_TEXT_PRIMARY,
      theme.textPrimary,
    ),
    textSecondary: orThemeColor(
      process.env.NEXT_PUBLIC_THEME_TEXT_SECONDARY,
      theme.textSecondary,
    ),
    textTertiary: orThemeColor(
      process.env.NEXT_PUBLIC_THEME_TEXT_TERTIARY,
      theme.textTertiary,
    ),
    borderPrimary: orThemeColor(
      process.env.NEXT_PUBLIC_THEME_BORDER_PRIMARY,
      theme.borderPrimary,
    ),
    borderSecondary: orThemeColor(
      process.env.NEXT_PUBLIC_THEME_BORDER_SECONDARY,
      theme.borderSecondary,
    ),
    borderTertiary: orThemeColor(
      process.env.NEXT_PUBLIC_THEME_BORDER_TERTIARY,
      theme.borderTertiary,
    ),
    sidebarBorder: orThemeColor(
      process.env.NEXT_PUBLIC_THEME_SIDEBAR_BORDER,
      theme.sidebarBorder,
    ),
    sidebarWidth:
      process.env.NEXT_PUBLIC_THEME_SIDEBAR_WIDTH?.trim() || theme.sidebarWidth,
  });

  return theme;
}
