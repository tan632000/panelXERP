import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viMaterial from "@/kernel/langs/vi/material.json";
import viModal from "@/kernel/langs/vi/modal.json";
import viOrder from "@/kernel/langs/vi/order.json";
import viPurchaseRequest from "@/kernel/langs/vi/purchaseRequest.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { MaterialOrderListPage } from "@plugins/inventory/material/components/MaterialOrderListPage";
import { OrderMaterialPage } from "@plugins/inventory/material/components/OrderMaterialPage";

import type { OrderMaterialDetail } from "@plugins/inventory/material/types";

const apiGet = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({
    can: () => true,
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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/inventory/materials/4",
  Link: ({ children }: { children: React.ReactNode }) => children,
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
});

describe("MaterialOrderListPage", () => {
  it("lists the orders with their delivery date and short-line count", async () => {
    renderWith(<MaterialOrderListPage />);

    expect(await screen.findByText("DH_2026_0001")).toBeInTheDocument();
    expect(screen.getByTestId("short-count-4").textContent).toBe("2");
    expect(screen.getByText("01/12/2026")).toBeInTheDocument();
  });
});
