import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/kernel/core/components/layout/Sidebar";
import viCommon from "@/kernel/langs/vi/common.json";

import type { SidebarSection } from "@/kernel/platform/plugins/navigation.types";

const authState = vi.hoisted(() => ({ userId: 1 }));
/** What the server holds under `sidebar_pins`, per account. */
const server = vi.hoisted(() => ({
  pins: new Map<number, string[]>(),
  puts: [] as Array<{ url: string; body: unknown }>,
}));

vi.mock("@/kernel/core/api/api", () => ({
  default: {
    get: vi.fn(async () => {
      const stored = server.pins.get(authState.userId);
      return { data: stored ? { visibleColumns: stored } : null };
    }),
    put: vi.fn(async (url: string, body: { visibleColumns: string[] }) => {
      server.puts.push({ url, body });
      server.pins.set(authState.userId, body.visibleColumns);
      return { data: body };
    }),
  },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: authState.userId }, can: () => true }),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  usePathname: () => "/warehouse/raw-material",
  Link: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const sections: SidebarSection[] = [
  {
    title: "sidebarSales",
    namespace: "sales",
    items: [
      { href: "/sales/order", icon: "shopping-cart", label: "salesOrder" },
    ],
  },
  {
    title: "sidebarWarehouse",
    namespace: "warehouse",
    items: [
      {
        href: "/warehouse/raw-material",
        icon: "building-warehouse",
        label: "rawMaterialWarehouse",
      },
      {
        href: "/warehouse/finished-product",
        icon: "building-warehouse",
        label: "finishedProductWarehouse",
      },
    ],
  },
  {
    title: "sidebarSystem",
    namespace: "system",
    items: [{ href: "/system/users", icon: "users", label: "userManagement" }],
  },
];

const messages = {
  common: viCommon,
  sales: { sidebarSales: "Bán hàng", salesOrder: "Đơn hàng (SO)" },
  warehouse: {
    sidebarWarehouse: "Kho",
    rawMaterialWarehouse: "Kho NVL",
    finishedProductWarehouse: "Kho TP",
  },
  system: { sidebarSystem: "Hệ thống", userManagement: "Quản lý người dùng" },
};

function renderSidebar(props: { drawer?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="vi" messages={messages}>
        <Sidebar moduleKey="warehouse" sections={sections} {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  // jsdom has no PointerEvent, so `pointerType` would never reach the hover handler.
  if (!("PointerEvent" in window)) {
    class PointerEventPolyfill extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "";
      }
    }
    Object.assign(window, { PointerEvent: PointerEventPolyfill });
  }
});

afterEach(() => {
  cleanup();
  authState.userId += 1;
  server.puts.length = 0;
});

describe("desktop sidebar", () => {
  it("lists the modules but not the system section, which lives in the user menu", () => {
    renderSidebar();

    expect(
      screen.getByRole("button", { name: /^Bán hàng/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Kho/ })).toBeInTheDocument();
    expect(screen.queryByText("Hệ thống")).not.toBeInTheDocument();
  });

  it("opens a module's functions on mouse hover without a click", () => {
    renderSidebar();

    fireEvent.pointerEnter(screen.getByRole("button", { name: /^Kho/ }), {
      pointerType: "mouse",
    });

    const menu = screen.getByRole("menu", { name: "Kho" });
    expect(
      within(menu).getByRole("menuitem", { name: "Kho NVL" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Kho TP" }),
    ).toBeInTheDocument();
  });

  it("closes the hover flyout once the mouse leaves the module row, still inside the sidebar", async () => {
    renderSidebar();
    const row = screen.getByRole("button", { name: /^Kho/ });

    fireEvent.pointerEnter(row, { pointerType: "mouse" });
    expect(screen.getByRole("menu", { name: "Kho" })).toBeInTheDocument();

    fireEvent.pointerLeave(row, { pointerType: "mouse" });
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
  });

  it("keeps the flyout open when the mouse crosses from the row into it", async () => {
    renderSidebar();
    const row = screen.getByRole("button", { name: /^Kho/ });

    fireEvent.pointerEnter(row, { pointerType: "mouse" });
    fireEvent.pointerLeave(row, { pointerType: "mouse" });
    fireEvent.mouseEnter(screen.getByRole("menu", { name: "Kho" }));
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(screen.getByRole("menu", { name: "Kho" })).toBeInTheDocument();
  });

  it("does not open on a touch hover, leaving the tap to toggle it", () => {
    renderSidebar();
    const row = screen.getByRole("button", { name: /^Kho/ });

    fireEvent.pointerEnter(row, { pointerType: "touch" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(row);
    expect(screen.getByRole("menu", { name: "Kho" })).toBeInTheDocument();
  });

  it("pins a function from the flyout to the top of the sidebar", async () => {
    renderSidebar();
    // Nothing pinned yet: the pinned block, hint included, is not drawn at all.
    expect(screen.queryByText(viCommon.sidebarPinned)).not.toBeInTheDocument();
    expect(screen.queryByText(viCommon.sidebarPinHint)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Kho/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ghim Kho TP" }));

    expect(await screen.findByText(viCommon.sidebarPinned)).toBeInTheDocument();
    expect(screen.queryByText(viCommon.sidebarPinHint)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kho TP/ })).toHaveAttribute(
      "href",
      "/warehouse/finished-product",
    );
    expect(
      screen.getByRole("button", { name: "Bỏ ghim Kho TP" }),
    ).toHaveAttribute("aria-pressed", "true");
    // Saved on the server against the account, not in this browser.
    await waitFor(() => expect(server.puts).toHaveLength(1));
    expect(server.puts).toEqual([
      {
        url: "/list-preferences/sidebar_pins",
        body: { visibleColumns: ["/warehouse/finished-product"] },
      },
    ]);
  });

  it("shows the pins the account saved on another device", async () => {
    server.pins.set(authState.userId, ["/sales/order"]);
    renderSidebar();

    expect(
      await screen.findByRole("link", { name: /Đơn hàng \(SO\)/ }),
    ).toHaveAttribute("href", "/sales/order");
    expect(screen.getByText(viCommon.sidebarPinned)).toBeInTheDocument();
  });

  it("collapses to a rail whose module tiles still open the flyout", () => {
    renderSidebar();

    fireEvent.click(
      screen.getByRole("button", { name: viCommon.sidebarCollapse }),
    );
    expect(
      screen.queryByPlaceholderText(viCommon.sidebarSearchPlaceholder),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Kho"));
    expect(screen.getByRole("menu", { name: "Kho" })).toBeInTheDocument();

    // The collapsed state is shared; leave it expanded for the next test.
    fireEvent.click(
      screen.getByRole("button", { name: viCommon.sidebarExpand }),
    );
  });

  it("finds a function typed without accents", () => {
    renderSidebar();

    fireEvent.change(
      screen.getByPlaceholderText(viCommon.sidebarSearchPlaceholder),
      {
        target: { value: "don hang" },
      },
    );

    expect(
      screen.getByRole("link", { name: /Đơn hàng \(SO\)/ }),
    ).toHaveAttribute("href", "/sales/order");
  });
});

describe("phone drawer", () => {
  it("opens on the current module with its functions expanded beneath it", () => {
    renderSidebar({ drawer: true });

    expect(screen.getByRole("button", { name: /^Kho/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("link", { name: "Kho NVL" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Đơn hàng (SO)" }),
    ).not.toBeInTheDocument();
  });

  it("expands one module at a time in place", () => {
    renderSidebar({ drawer: true });

    fireEvent.click(screen.getByRole("button", { name: /^Bán hàng/ }));

    expect(
      screen.getByRole("link", { name: "Đơn hàng (SO)" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Kho NVL" }),
    ).not.toBeInTheDocument();
  });
});
