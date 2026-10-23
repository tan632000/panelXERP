/**
 * Customer / YAML profile shape (e.g. customer-profile theme section).
 * Maps to ErpTheme tokens consumed by Tailwind CSS variables.
 */
export interface ThemeProfileInput {
  primary_color?: string;
  primary_hover?: string;
  primary_light?: string;
  sidebar_bg?: string;
  sidebar_text?: string;
  sidebar_text_muted?: string;
  surface_bg?: string;
}

/** Design tokens — defaults match globals.css @theme */
export interface ErpTheme {
  brand: string;
  brandHover: string;
  brandLight: string;
  brand50: string;
  brand100: string;
  surfacePrimary: string;
  surfaceSecondary: string;
  surfaceTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  borderPrimary: string;
  borderSecondary: string;
  borderTertiary: string;
  sidebarBg: string;
  sidebarText: string;
  sidebarTextMuted: string;
  sidebarBorder: string;
  successBg: string;
  successText: string;
  warningBg: string;
  warningText: string;
  infoBg: string;
  infoText: string;
  dangerBg: string;
  dangerText: string;
  purpleBg: string;
  purpleText: string;
  sidebarWidth: string;
}

export const DEFAULT_ERP_THEME: ErpTheme = {
  brand: "#1a2a5e",
  brandHover: "#253a7e",
  brandLight: "#e8edf8",
  brand50: "#f0f3fa",
  brand100: "#e0e6f4",
  surfacePrimary: "#ffffff",
  surfaceSecondary: "#f5f6f8",
  surfaceTertiary: "#eef0f3",
  textPrimary: "#111827",
  textSecondary: "#6b7280",
  textTertiary: "#9ca3af",
  borderPrimary: "#d1d5db",
  borderSecondary: "#e5e7eb",
  borderTertiary: "#f3f4f6",
  sidebarBg: "#ffffff",
  sidebarText: "#111827",
  sidebarTextMuted: "#6b7280",
  sidebarBorder: "#e5e7eb",
  successBg: "#eaf3de",
  successText: "#3b6d11",
  warningBg: "#faeeda",
  warningText: "#854f0b",
  infoBg: "#e6f1fb",
  infoText: "#185fa5",
  dangerBg: "#fcebeb",
  dangerText: "#a32d2d",
  purpleBg: "#eeedfe",
  purpleText: "#3c3489",
  sidebarWidth: "228px",
};

/** CSS variable names consumed by Tailwind @theme and components */
export const THEME_CSS_VAR_MAP: Record<keyof ErpTheme, string> = {
  brand: "--color-brand",
  brandHover: "--color-brand-hover",
  brandLight: "--color-brand-light",
  brand50: "--color-brand-50",
  brand100: "--color-brand-100",
  surfacePrimary: "--color-surface-primary",
  surfaceSecondary: "--color-surface-secondary",
  surfaceTertiary: "--color-surface-tertiary",
  textPrimary: "--color-text-primary",
  textSecondary: "--color-text-secondary",
  textTertiary: "--color-text-tertiary",
  borderPrimary: "--color-border-primary",
  borderSecondary: "--color-border-secondary",
  borderTertiary: "--color-border-tertiary",
  sidebarBg: "--color-sidebar-bg",
  sidebarText: "--color-sidebar-text",
  sidebarTextMuted: "--color-sidebar-text-muted",
  sidebarBorder: "--color-sidebar-border",
  successBg: "--color-success-bg",
  successText: "--color-success-text",
  warningBg: "--color-warning-bg",
  warningText: "--color-warning-text",
  infoBg: "--color-info-bg",
  infoText: "--color-info-text",
  dangerBg: "--color-danger-bg",
  dangerText: "--color-danger-text",
  purpleBg: "--color-purple-bg",
  purpleText: "--color-purple-text",
  sidebarWidth: "--sidebar-width",
};
