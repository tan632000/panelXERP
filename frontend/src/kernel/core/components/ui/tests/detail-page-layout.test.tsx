import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DetailPageLayout } from "@/kernel/core/components/ui/DetailPageLayout";
import en from "@/kernel/langs/en/common.json";

import type { BreadcrumbItem } from "@/kernel/core/components/ui/Breadcrumb";
import type { ReactNode } from "react";

// The locale-aware Link only needs to render an anchor here.
vi.mock("@/kernel/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
// The header chrome reads auth and layout context the layout itself does not own.
vi.mock("@/kernel/core/components/layout/MobileNavButton", () => ({
  MobileNavButton: () => null,
}));
vi.mock("@/kernel/core/components/ui/PageHeaderUserMenu", () => ({
  PageHeaderUserMenu: () => null,
}));

afterEach(cleanup);

function renderLayout(breadcrumbs: BreadcrumbItem[], hideClose?: boolean) {
  render(
    <NextIntlClientProvider locale="en" messages={{ common: en }}>
      <DetailPageLayout
        breadcrumbs={breadcrumbs}
        title="REQ_0001"
        hideClose={hideClose}
      >
        <p>body</p>
      </DetailPageLayout>
    </NextIntlClientProvider>,
  );
}

const closeLink = () => screen.queryByRole("link", { name: en.close });

describe("DetailPageLayout close button", () => {
  it("links the X to the list crumb", () => {
    renderLayout([
      { label: "Requests", href: "/sales/requests" },
      { label: "REQ_0001" },
    ]);
    expect(closeLink()).toHaveAttribute("href", "/sales/requests");
  });

  it("links the X to a parent record when that is the last linked crumb", () => {
    renderLayout([
      { label: "Purchase orders", href: "/inventory/purchase-orders" },
      { label: "PO_0001", href: "/inventory/purchase-orders/1" },
      { label: "Return" },
    ]);
    expect(closeLink()).toHaveAttribute("href", "/inventory/purchase-orders/1");
  });

  it("shows no X when no crumb before the current page has a link", () => {
    renderLayout([{ label: "Requests" }, { label: "REQ_0001", href: "/x" }]);
    expect(closeLink()).toBeNull();
  });

  it("shows no X on a screen that opts out", () => {
    renderLayout(
      [{ label: "Requests", href: "/sales/requests" }, { label: "New" }],
      true,
    );
    expect(closeLink()).toBeNull();
  });
});
