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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viModal from "@/kernel/langs/vi/modal.json";
import viProduction from "@/kernel/langs/vi/production.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { ProductionOrderListPage } from "@plugins/production/production-order/components/ProductionOrderListPage";
import { ProductionOrderPermission } from "@plugins/production/production-order/permissions/production-order-permission.keys";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ value: "" }));
const granted = vi.hoisted(() => ({ value: new Set<string>() }));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => {
  const can = (permission: string) => granted.value.has(permission);
  return {
    useAuth: () => ({
      can,
      permissions: [...granted.value],
      user: { id: 50, role: "productionManager" },
      logout: vi.fn(),
    }),
    useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(search.value),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/production/orders",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const OPEN_ORDERS = [
  {
    id: 7,
    code: "DH_2026_0007",
    customerName: "Công ty Điện Nam",
    deliveryDate: "2026-12-01",
  },
  {
    id: 8,
    code: "DH_2026_0008",
    customerName: "Alpha Panels",
    deliveryDate: null,
  },
];

const ROW = {
  id: 3,
  code: "LSX_2026_0003",
  orderId: 7,
  orderCode: "DH_2026_0007",
  status: "draft" as const,
  customerName: "Công ty Điện Nam",
  deliveryDate: "2026-12-01",
  unitCount: 2,
  createdAt: "2026-10-30T08:00:00.000Z",
  releasedAt: null,
};

function renderPage() {
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
          production: viProduction,
          status: viStatus,
        }}
      >
        <NotificationProvider>
          <ProductionOrderListPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  search.value = "";
  granted.value = new Set(Object.values(ProductionOrderPermission));
  apiGet.mockImplementation((url: string) => {
    if (url === "/production/open-orders") {
      return Promise.resolve({ data: OPEN_ORDERS });
    }
    return Promise.resolve({
      data: {
        data: [ROW],
        meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
      },
    });
  });
});

afterEach(cleanup);

describe("production order creation", () => {
  it("creates a production order for the open order picked, then opens it", async () => {
    apiPost.mockResolvedValue({
      data: { ...ROW, id: 12, units: [], events: [] },
    });
    renderPage();
    await screen.findByText("LSX_2026_0003");

    fireEvent.click(
      screen.getByRole("button", { name: viProduction.addButton }),
    );
    const picker = await screen.findByLabelText(viProduction.create.order);
    const dialog = picker.closest("form") as HTMLElement;
    await waitFor(() =>
      expect(picker.querySelectorAll("option")).toHaveLength(3),
    );
    expect(
      within(dialog).getByRole("button", { name: viProduction.create.submit }),
    ).toBeDisabled();

    fireEvent.change(picker, { target: { value: "7" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: viProduction.create.submit }),
    );

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/production/orders", {
        orderId: 7,
      }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/production/orders/12"),
    );
  });

  it("offers no create button without production_order:create", async () => {
    granted.value = new Set([ProductionOrderPermission.read]);
    renderPage();
    await screen.findByText("LSX_2026_0003");

    expect(
      screen.queryByRole("button", { name: viProduction.addButton }),
    ).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalledWith(
      "/production/open-orders",
      expect.anything(),
    );
  });

  it("narrows the list to one sales order when the link carries its id", async () => {
    search.value = "orderId=7";
    renderPage();
    await screen.findByText("LSX_2026_0003");

    expect(apiGet).toHaveBeenCalledWith("/production/orders", {
      params: expect.objectContaining({ orderId: 7 }),
    });
    expect(
      screen.getByRole("link", { name: viProduction.clearOrderFilter }),
    ).toHaveAttribute("href", "/production/orders");
  });
});
