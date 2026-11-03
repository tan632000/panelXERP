import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModuleShell } from "@/kernel/core/components/layout/ModuleShell";
import viCommon from "@/kernel/langs/vi/common.json";

import { ProductionProgressPermission } from "@plugins/production/progress/permissions/progress-permission.keys";

// A sales reader: follows production, works no cabinet.
const granted = new Set<string>([
  "production_order:read",
  ProductionProgressPermission.read,
]);

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 1 },
    can: (permission: string) => granted.has(permission),
    isLoading: false,
  }),
}));

vi.mock("@/kernel/core/components/layout/ResponsiveSidebar", () => ({
  ResponsiveSidebar: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/kernel/core/components/ui/ExcelJobsPanel", () => ({
  ExcelJobsPanel: () => null,
}));

vi.mock("@/kernel/platform/features/route-feature.utils", () => ({
  isRouteFeatureEnabled: () => true,
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  // The cabinet list asks for production_progress:update, which a reader lacks.
  usePathname: () => "/production/my-units",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

afterEach(cleanup);

describe("production module back link", () => {
  it("sends a refused reader to a screen they may open, never to the hidden cabinet entry", () => {
    render(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <ModuleShell moduleKey="production">
          <span>page</span>
        </ModuleShell>
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("link", { name: viCommon.backToModule }),
    ).toHaveAttribute("href", "/production/orders");
  });
});
