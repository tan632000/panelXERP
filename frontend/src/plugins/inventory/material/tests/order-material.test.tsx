import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viMaterial from "@/kernel/langs/vi/material.json";
import viModal from "@/kernel/langs/vi/modal.json";
import viOrder from "@/kernel/langs/vi/order.json";
import viProduction from "@/kernel/langs/vi/production.json";
import viPurchaseRequest from "@/kernel/langs/vi/purchaseRequest.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { MaterialOrderListPage } from "@plugins/inventory/material/components/MaterialOrderListPage";
import { OrderMaterialPage } from "@plugins/inventory/material/components/OrderMaterialPage";

import type { OrderMaterialDetail } from "@plugins/inventory/material/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
/** `null` grants everything; a set grants only what it lists. */
const granted = vi.hoisted(() => ({ value: null as Set<string> | null }));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({
    can: (permission: string) =>
      granted.value ? granted.value.has(permission) : true,
    permissions: ["material:read"],
    user: { id: 40, role: "storekeeper" },
    logout: vi.fn(),
  }),
  useOptionalAuth: () => ({ can: () => true, permissions: ["material:read"] }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "4" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/inventory/materials/4",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const ORDER = {
  id: 4,
  code: "DH_2026_0001",
  status: "open" as const,
  deliveryDate: "2026-12-01",
  createdAt: "2026-10-28T08:00:00.000Z",
  customerName: "Công ty Điện Nam",
  projectName: "Nhà máy A",
  requestId: 5,
  salesOwnerId: 11,
  salesOwnerName: "Sales A",
};

const DETAIL: OrderMaterialDetail = {
  order: ORDER,
  demandBearing: true,
  items: [
    {
      itemId: 101,
      itemCode: "VT-0101",
      itemName: "Aptomat 3P 100A",
      itemUnit: "Cái",
      demand: 6,
      reserved: 0,
      issued: 0,
      returned: 0,
      short: 6,
    },
    {
      itemId: 102,
      itemCode: "VT-0102",
      itemName: "Thanh cái đồng",
      itemUnit: "m",
      demand: 1.5,
      reserved: 0.5,
      issued: 0.5,
      returned: 0.2,
      short: 0.7,
    },
  ],
  panels: [
    {
      lineId: 1,
      tag: "MSB-01",
      description: null,
      quantity: 2,
      bomLines: [
        {
          bomLineId: 11,
          itemId: 101,
          itemCode: "VT-0101",
          itemName: "Aptomat 3P 100A",
          itemUnit: "Cái",
          perPanelQuantity: 3,
          demand: 6,
        },
      ],
    },
  ],
  unlinked: [
    {
      bomLineId: 12,
      lineId: 1,
      tag: "MSB-01",
      itemCode: "LEGACY-01",
      itemName: "Vật tư cũ",
      itemUnit: "Cái",
      perPanelQuantity: 5,
    },
  ],
  overBomIssues: [],
};

function renderWith(page: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{
          common: viCommon,
          modal: viModal,
          material: viMaterial,
          order: viOrder,
          production: viProduction,
          purchaseRequest: viPurchaseRequest,
          status: viStatus,
        }}
      >
        <NotificationProvider>{page}</NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = null;
  apiGet.mockImplementation((url: string) => {
    if (url === "/inventory/materials/orders/4") {
      return Promise.resolve({ data: DETAIL });
    }
    if (url === "/inventory/materials/orders") {
      return Promise.resolve({
        data: {
          data: [{ ...ORDER, shortLineCount: 2, unlinkedCount: 1 }],
          meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
        },
      });
    }
    return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
  });
});

afterEach(cleanup);

describe("OrderMaterialPage", () => {
  it("shows demand, reserved, issued, returned and short per item", async () => {
    renderWith(<OrderMaterialPage />);

    expect(await screen.findByText("VT-0102")).toBeInTheDocument();
    // The items table and each panel's BOM both have a demand column.
    expect(screen.getAllByText(viMaterial.item.demand).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(viMaterial.item.short).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByTestId("short-101").textContent).toBe("6");
    expect(screen.getByTestId("short-102").textContent).toBe("0,7");
  });

  it("lists the unlinked line apart, with a warning", async () => {
    renderWith(<OrderMaterialPage />);

    expect(
      await screen.findByText(viMaterial.unlinkedWarning),
    ).toBeInTheDocument();
    expect(screen.getByText("LEGACY-01")).toBeInTheDocument();
  });

  it("shows no price anywhere", async () => {
    renderWith(<OrderMaterialPage />);
    await screen.findByText("VT-0102");

    for (const text of [
      /đơn giá/i,
      /thành tiền/i,
      /tổng cộng/i,
      /VAT/,
      /₫|VND/,
    ]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
  });

  it("spaces the tabs from the section under them like any other section", async () => {
    renderWith(<OrderMaterialPage />);
    await screen.findByText("VT-0102");

    // Sections are kept apart by their own bottom margin; without one the tabs touch the heading.
    expect(screen.getByRole("tablist")).toHaveClass("mb-6");
  });
});

describe("MaterialOrderListPage", () => {
  it("lists the orders with their delivery date and short-line count", async () => {
    renderWith(<MaterialOrderListPage />);

    expect(await screen.findByText("DH_2026_0001")).toBeInTheDocument();
    expect(screen.getByTestId("short-count-4").textContent).toBe("2");
    expect(screen.getByText("01/12/2026")).toBeInTheDocument();
  });
});

const productionRow = (
  id: number,
  status: "draft" | "released" | "completed" | "cancelled",
) => ({
  id,
  code: `LSX_2026_000${id}`,
  orderId: 4,
  orderCode: ORDER.code,
  status,
  customerName: ORDER.customerName,
  deliveryDate: ORDER.deliveryDate,
  unitCount: 2,
  createdAt: "2026-10-30T08:00:00.000Z",
  releasedAt: null,
});

/** The orders-of-an-order lookup answers newest first, cancelled ones included. */
function withProductionOrders(rows: Array<ReturnType<typeof productionRow>>) {
  const base = apiGet.getMockImplementation() as (
    url: string,
    config?: unknown,
  ) => Promise<unknown>;
  apiGet.mockImplementation((url: string, config?: unknown) =>
    url === "/production/orders"
      ? Promise.resolve({
          data: {
            data: rows,
            meta: { page: 1, limit: 25, total: rows.length, totalPages: 1 },
          },
        })
      : base(url, config),
  );
}

/** A production manager holds no `order:read`; the material page is their way to an order. */
const PRODUCTION_MANAGER = new Set([
  "material:read",
  "production_order:read",
  "production_order:create",
  "production_order:update",
  "production_order:release",
  "production_order:cancel",
]);

describe("OrderMaterialPage production entry", () => {
  const createLabel = viMaterial.actions.createProduction;

  it("lets a production manager without order:read start a production order from here", async () => {
    granted.value = PRODUCTION_MANAGER;
    apiPost.mockResolvedValue({ data: { id: 9 } });
    renderWith(<OrderMaterialPage />);

    fireEvent.click(await screen.findByRole("button", { name: createLabel }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/production/orders", {
        orderId: 4,
      }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/production/orders/9"),
    );
  });

  it("replaces the button with a link while a live production order exists", async () => {
    granted.value = PRODUCTION_MANAGER;
    withProductionOrders([
      productionRow(2, "released"),
      productionRow(1, "cancelled"),
    ]);
    renderWith(<OrderMaterialPage />);

    const link = await screen.findByRole("link", {
      name: viMaterial.actions.viewProduction.replace(
        "{code}",
        "LSX_2026_0002",
      ),
    });
    expect(link).toHaveAttribute("href", "/production/orders/2");
    expect(
      screen.queryByRole("button", { name: createLabel }),
    ).not.toBeInTheDocument();
  });

  it("keeps the button when the only production order was cancelled", async () => {
    granted.value = PRODUCTION_MANAGER;
    withProductionOrders([productionRow(1, "cancelled")]);
    renderWith(<OrderMaterialPage />);

    expect(
      await screen.findByRole("button", { name: createLabel }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /LSX_2026/ }),
    ).not.toBeInTheDocument();
  });

  it("offers a holder of neither production permission no entry at all", async () => {
    granted.value = new Set(["material:read"]);
    renderWith(<OrderMaterialPage />);
    await screen.findByText("VT-0102");

    expect(
      screen.queryByRole("button", { name: createLabel }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /LSX_2026/ }),
    ).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalledWith(
      "/production/orders",
      expect.anything(),
    );
  });

  it("offers a reader without create only the link", async () => {
    granted.value = new Set(["material:read", "production_order:read"]);
    withProductionOrders([productionRow(3, "draft")]);
    renderWith(<OrderMaterialPage />);

    expect(
      await screen.findByRole("link", { name: /LSX_2026_0003/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: createLabel }),
    ).not.toBeInTheDocument();
  });
});

/** The order read answers with the given status instead of an open one. */
function orderIs(status: string) {
  const base = apiGet.getMockImplementation() as (
    url: string,
    config?: unknown,
  ) => Promise<unknown>;
  apiGet.mockImplementation((url: string, config?: unknown) =>
    url === "/inventory/materials/orders/4"
      ? Promise.resolve({
          data: { ...DETAIL, order: { ...ORDER, status } },
        })
      : base(url, config),
  );
}

describe("OrderMaterialPage actions by order status", () => {
  const actions = [
    viMaterial.actions.issue,
    viMaterial.actions.workshopReturn,
    viMaterial.actions.requestPurchase,
  ];

  it("offers issue, return and purchase request for an order in production", async () => {
    orderIs("in_production");
    renderWith(<OrderMaterialPage />);
    await screen.findByText("VT-0102");

    for (const label of actions) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // A production order is only started from an open order.
    expect(
      screen.queryByRole("button", {
        name: viMaterial.actions.createProduction,
      }),
    ).not.toBeInTheDocument();
  });

  it("offers none of them for a delivered order", async () => {
    orderIs("delivered");
    renderWith(<OrderMaterialPage />);
    await screen.findByText("VT-0102");

    for (const label of actions) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});
