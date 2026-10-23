import { redirect } from "next/navigation";

import { LANDING_FALLBACK_PATH } from "@/kernel/core/permissions/landing-path";

/**
 * Reached only when the i18n middleware does not rewrite `/` into `[locale]/page.tsx`, which
 * picks the landing screen by permission; the fallback screen is open to every account.
 */
export default function HomePage() {
  redirect(LANDING_FALLBACK_PATH);
}
