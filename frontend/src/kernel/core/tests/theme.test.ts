import { describe, expect, it } from "vitest";

import {
  themeToCssBlock,
  themeToCssProperties,
} from "@kernel/core/theme/apply-theme";
import {
  resolveThemeFromEnv,
  resolveThemeFromProfile,
  themeProfileToPatch,
} from "@kernel/core/theme/theme.config";
import { DEFAULT_ERP_THEME } from "@kernel/core/theme/theme.tokens";

describe("theme", () => {
  it("maps tokens to CSS variables", () => {
    const props = themeToCssProperties(DEFAULT_ERP_THEME);
    expect(props["--color-brand"]).toBe("#1a2a5e");
    expect(props["--color-sidebar-bg"]).toBe("#ffffff");
    expect(props["--sidebar-width"]).toBe("228px");
  });

  it("renders :root block for SSR", () => {
    const block = themeToCssBlock(DEFAULT_ERP_THEME);
    expect(block).toContain(":root {");
    expect(block).toContain("--color-brand: #1a2a5e;");
    expect(block).toContain("--color-sidebar-bg: #ffffff;");
  });

  it("maps YAML-style profile keys", () => {
    const theme = resolveThemeFromProfile({
      primary_color: "#2563eb",
      primary_hover: "#1d4ed8",
      primary_light: "#dbeafe",
      sidebar_bg: "#1a2a5e",
      sidebar_text: "#ffffff",
      surface_bg: "#eef0f3",
    });

    expect(theme.brand).toBe("#2563eb");
    expect(theme.brandHover).toBe("#1d4ed8");
    expect(theme.sidebarBg).toBe("#1a2a5e");
    expect(theme.sidebarText).toBe("#ffffff");
    expect(theme.surfaceTertiary).toBe("#eef0f3");
  });

  it("resolves env primary_color alias", () => {
    const prev = process.env.NEXT_PUBLIC_THEME_PRIMARY_COLOR;
    process.env.NEXT_PUBLIC_THEME_PRIMARY_COLOR = "ff0000";
    expect(resolveThemeFromEnv().brand).toBe("#ff0000");
    process.env.NEXT_PUBLIC_THEME_PRIMARY_COLOR = prev;
  });

  it("themeProfileToPatch ignores empty values", () => {
    expect(themeProfileToPatch({})).toEqual({});
  });
});
