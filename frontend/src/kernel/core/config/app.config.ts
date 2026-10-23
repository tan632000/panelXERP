/**
 * White-label settings for client + server.
 *
 * NEXT_PUBLIC_* must use direct `process.env.NEXT_PUBLIC_*` references so Next.js
 * can inline them into client bundles. Dynamic access (`process.env[key]`) is NOT
 * replaced and always falls back on the browser.
 */
function orDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export const appConfig = {
  name: orDefault(process.env.NEXT_PUBLIC_APP_NAME, "ERP Platform"),
  description: orDefault(
    process.env.NEXT_PUBLIC_APP_DESCRIPTION,
    "Manufacturing ERP — modular monolith",
  ),
  shortName: orDefault(process.env.NEXT_PUBLIC_APP_SHORT_NAME, "ERP"),
  /** Sidebar badge and every printed letterhead. Swap `public/brand/logo.svg` per customer, or
   * point this at another URL. */
  logoUrl: orDefault(process.env.NEXT_PUBLIC_APP_LOGO_URL, "/brand/logo.svg"),
  tenantId: orDefault(process.env.NEXT_PUBLIC_TENANT_ID, "default"),
} as const;

/** Sidebar logo badge when no image URL is set. Uses up to 2 chars from shortName. */
export function getAppInitials(label: string = appConfig.shortName): string {
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ER";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
