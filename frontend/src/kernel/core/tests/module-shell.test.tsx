import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModuleShell } from "@/kernel/core/components/layout/ModuleShell";
import viCommon from "@/kernel/langs/vi/common.json";

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1 }, can: () => true, isLoading: false }),
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
  usePathname: () => "/sales/quotations/1",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(cleanup);

describe("ModuleShell", () => {
  it("is a positioned frame, so a page's sr-only labels cannot grow the document past the viewport", () => {
    const { container } = render(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <ModuleShell moduleKey="sales">
          <span className="sr-only">label</span>
        </ModuleShell>
      </NextIntlClientProvider>,
    );

    const frame = container.firstElementChild;
    expect(frame).toHaveClass("relative", "overflow-hidden", "h-dvh");
  });
});
