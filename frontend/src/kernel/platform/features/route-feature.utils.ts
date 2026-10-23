import {
  FRONTEND_FEATURE_CATALOG,
  isFrontendFeatureEnabled,
} from "@kernel/platform/features/enabled-feature-keys";

import { normalizeModulePath } from "@/kernel/core/permissions/route-permissions";

export interface RouteFeatureEntry {
  href: string;
  featureKey: string;
}

function buildRouteFeatureEntries(): RouteFeatureEntry[] {
  const entries: RouteFeatureEntry[] = [];

  for (const feature of FRONTEND_FEATURE_CATALOG) {
    for (const item of feature.items) {
      entries.push({
        href: item.href,
        featureKey: item.featureKey ?? feature.key,
      });
    }
  }

  return entries.sort((a, b) => b.href.length - a.href.length);
}

const ROUTE_FEATURE_ENTRIES = buildRouteFeatureEntries();

export function resolveFeatureKeyForPath(pathname: string): string | null {
  const normalizedPath = normalizeModulePath(pathname);

  for (const entry of ROUTE_FEATURE_ENTRIES) {
    if (
      normalizedPath === entry.href ||
      normalizedPath.startsWith(`${entry.href}/`)
    ) {
      return entry.featureKey;
    }
  }

  return null;
}

export function isRouteFeatureEnabled(pathname: string): boolean {
  const featureKey = resolveFeatureKeyForPath(pathname);
  if (!featureKey) {
    return true;
  }
  return isFrontendFeatureEnabled(featureKey);
}
