import { appConfig, getAppInitials } from "@/kernel/core/config/app.config";

/** The sidebar badge: the configured customer logo, or the app initials when none is set. */
export function BrandLogo() {
  if (!appConfig.logoUrl) return getAppInitials();
  return (
    // eslint-disable-next-line @next/next/no-img-element -- per-deployment file or external URL
    <img
      src={appConfig.logoUrl}
      alt={appConfig.name}
      className="size-full rounded-[inherit] object-contain p-0.5"
    />
  );
}
