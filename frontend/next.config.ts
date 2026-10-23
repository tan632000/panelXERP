import path from "node:path";

import { loadEnvConfig } from "@next/env";
import createNextIntlPlugin from "next-intl/plugin";

import type { NextConfig } from "next";

// Root .env (shared) first, then frontend/.env overrides
const repoRoot = path.resolve(__dirname, "..");
loadEnvConfig(repoRoot);
loadEnvConfig(__dirname);

/** Map shared keys → NEXT_PUBLIC_* for client bundle (see root .env) */
function publicEnv(name: string, sharedFallback?: string): string | undefined {
  const direct = process.env[name]?.trim();
  if (direct) return direct;
  if (sharedFallback) {
    const shared = process.env[sharedFallback]?.trim();
    if (shared) return shared;
  }
  return undefined;
}

const withNextIntl = createNextIntlPlugin("./src/kernel/i18n/request.ts");

const srcDir = path.join(__dirname, "src");

const pathAliases = {
  "@": "./src",
  "@kernel": "./src/kernel",
  "@plugins": "./src/plugins",
};

const allowedDevOrigins = (() => {
  const apiUrl = publicEnv("NEXT_PUBLIC_API_URL");
  if (!apiUrl) return [];

  try {
    const hostname = new URL(apiUrl).hostname;
    return hostname === "localhost" ? [] : [hostname];
  } catch {
    return [];
  }
})();

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    // The type pass is the heaviest part of `next build` — it forks a worker
    // that needs well over 1GB and aborts on a small server. Types are gated by
    // `make typecheck` (tsc --noEmit) in CI and locally, not by the image build.
    ignoreBuildErrors: process.env.NEXT_SKIP_TYPE_CHECK === "true",
  },
  outputFileTracingRoot: __dirname,
  allowedDevOrigins: [
    ...allowedDevOrigins,
    "*.ngrok-free.app",
    "*.trycloudflare.com",
  ],
  turbopack: {
    root: __dirname,
    resolveAlias: pathAliases,
  },
  async rewrites() {
    const internal =
      process.env.API_INTERNAL_URL?.replace(/\/$/, "") ||
      (process.env.NODE_ENV === "production"
        ? "http://backend:8080"
        : undefined);
    if (!internal) return [];
    return [{ source: "/api/:path*", destination: `${internal}/api/:path*` }];
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.join(srcDir),
      "@kernel": path.join(srcDir, "kernel"),
      "@plugins": path.join(srcDir, "plugins"),
    };
    return config;
  },
  env: {
    NEXT_PUBLIC_TENANT_ID:
      publicEnv("NEXT_PUBLIC_TENANT_ID", "TENANT_ID") ?? "default",
    NEXT_PUBLIC_APP_NAME:
      publicEnv("NEXT_PUBLIC_APP_NAME", "APP_DISPLAY_NAME") ?? "ERP Platform",
    NEXT_PUBLIC_APP_SHORT_NAME:
      publicEnv("NEXT_PUBLIC_APP_SHORT_NAME", "APP_SHORT_NAME") ?? "ERP",
    NEXT_PUBLIC_APP_DESCRIPTION:
      publicEnv("NEXT_PUBLIC_APP_DESCRIPTION", "APP_DESCRIPTION") ??
      "Manufacturing ERP — modular monolith",
    NEXT_PUBLIC_COMPANY_NAME_VI:
      publicEnv("NEXT_PUBLIC_COMPANY_NAME_VI", "COMPANY_NAME_VI") ?? "",
    NEXT_PUBLIC_COMPANY_NAME_EN:
      publicEnv("NEXT_PUBLIC_COMPANY_NAME_EN", "COMPANY_NAME_EN") ?? "",
    NEXT_PUBLIC_COMPANY_SHORT_NAME_VI:
      publicEnv("NEXT_PUBLIC_COMPANY_SHORT_NAME_VI", "COMPANY_SHORT_NAME_VI") ??
      "",
    NEXT_PUBLIC_COMPANY_SHORT_NAME_EN:
      publicEnv("NEXT_PUBLIC_COMPANY_SHORT_NAME_EN", "COMPANY_SHORT_NAME_EN") ??
      "",
    NEXT_PUBLIC_COMPANY_ADDRESS_VI:
      publicEnv("NEXT_PUBLIC_COMPANY_ADDRESS_VI", "COMPANY_ADDRESS_VI") ?? "",
    NEXT_PUBLIC_COMPANY_ADDRESS_EN:
      publicEnv("NEXT_PUBLIC_COMPANY_ADDRESS_EN", "COMPANY_ADDRESS_EN") ?? "",
    NEXT_PUBLIC_COMPANY_PHONE:
      publicEnv("NEXT_PUBLIC_COMPANY_PHONE", "COMPANY_PHONE") ?? "",
    NEXT_PUBLIC_COMPANY_TAX_CODE:
      publicEnv("NEXT_PUBLIC_COMPANY_TAX_CODE", "COMPANY_TAX_CODE") ?? "",
    NEXT_PUBLIC_ENABLED_PLUGINS:
      publicEnv("NEXT_PUBLIC_ENABLED_PLUGINS", "ENABLED_PLUGINS") ?? "",
    NEXT_PUBLIC_ENABLED_FEATURES:
      publicEnv("NEXT_PUBLIC_ENABLED_FEATURES", "ENABLED_FEATURES") ?? "",
  },
};

export default withNextIntl(nextConfig);
