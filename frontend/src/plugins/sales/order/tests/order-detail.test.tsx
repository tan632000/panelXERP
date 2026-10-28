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
import viModal from "@/kernel/langs/vi/modal.json";
import viOrder from "@/kernel/langs/vi/order.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { OrderDetailPage } from "@plugins/sales/order/components/OrderDetailPage";
import { OrderPermission } from "@plugins/sales/order/permissions/order.permissions";

import type { OrderDetail } from "@plugins/sales/order/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const apiPatch = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);

vi.mock("@/kernel/core/api/api", () => ({
  default: {
    get: apiGet,
    post: apiPost,
    patch: apiPatch,
    delete: vi.fn(),
  },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({
    can,
    permissions: [...granted.value],
    user: { id: 20, role: "salesManager" },
    logout: vi.fn(),
  }),
  useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "4" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/sales/orders/4",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function order(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 4,
    code: "DH_2026_0001",
    status: "open",
    quotationId: 9,
    quotationVer: 2,
    requestId: 5,
    estimateId: 7,
    estimateRevision: 1,
    customerId: 3,
    customerName: "Alpha Panels",
    customerTaxCode: "0101234567",
    customerAddress: "1 Demo Street",
    projectId: 8,
    projectName: "Tower A",
    contractNo: "HD-01",
    contractDate: null,
    deliveryDate: "2027-03-01",
    terms: ["Bảo hành 12 tháng", "Giao hàng 1 - 2 tuần"],
    subtotal: 3_000_000,
    discountAmount: 0,
    taxable: 3_000_000,
    vatRate: 8,
    vatAmount: 240_000,
    total: 3_240_000,
    lines: [
      {
        id: 1,
        tag: "MSB-01",
        description: "Main switchboard",
        quantity: 2,
        unitPrice: 1_500_000,
        amount: 3_000_000,
        bomLines: [
          {
            id: 11,
            itemCode: "LC1D09",
            itemName: "Contactor 9A",
            itemBrand: "Schneider",
            itemUnit: "pcs",
            quantity: 3,
          },
        ],
      },
    ],
    chain: {
      request: { id: 5, code: "YC_2026_0001", title: "Cabinet", status: "won" },
      estimate: { id: 7, code: "DT_2026_0001", revision: 1 },
      quotation: { id: 9, code: "01-25102026/BG", ver: 2 },
    },
    ...overrides,
  } as OrderDetail;
}

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
          order: viOrder,
          status: viStatus,
        }}
      >
        <NotificationProvider>
          <OrderDetailPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const grant = (...permissions: string[]) => {
  granted.value = new Set(permissions);
};
const EVERYTHING = Object.values(OrderPermission);

beforeEach(() => {
  vi.clearAllMocks();
  grant(...EVERYTHING);
  apiGet.mockResolvedValue({ data: order() });
});

afterEach(cleanup);

describe("OrderDetailPage", () => {
  it("shows the chain from request to order, each earlier step a link", async () => {
    renderPage();

    const nav = await screen.findByRole("navigation", {
      name: viOrder.chain.title,
    });
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual([
      "/sales/requests/5",
      "/sales/estimates/7",
      "/sales/quotations/9",
    ]);
    expect(nav).toHaveTextContent("YC_2026_0001");
    expect(nav).toHaveTextContent("DT_2026_0001 #1");
    expect(nav).toHaveTextContent("01-25102026/BG v2");
    expect(nav).toHaveTextContent("DH_2026_0001");
  });

  it("links to the order's materials only for a holder of material:read", async () => {
    grant(...EVERYTHING, "material:read");
    renderPage();
    const link = await screen.findByRole("link", { name: viOrder.materials });
    expect(link).toHaveAttribute("href", "/inventory/materials/4");
    cleanup();

    grant(...EVERYTHING);
    renderPage();
    await screen.findByText("MSB-01");
    expect(
      screen.queryByRole("link", { name: viOrder.materials }),
    ).not.toBeInTheDocument();
  });

  it("shows the copied lines, BOM, totals and terms, none of them editable", async () => {
    renderPage();

    expect(await screen.findByText("MSB-01")).toBeInTheDocument();
    expect(screen.getByText("Contactor 9A · LC1D09 · Schneider")).toBeVisible();
    expect(screen.getByText("Bảo hành 12 tháng")).toBeVisible();
    expect(screen.getByText("VAT (8%)")).toBeVisible();
    // The only inputs are the three contract fields.
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });

  it("edits the three contract fields of an open order and sends nothing else", async () => {
    apiPatch.mockResolvedValue({ data: order({ contractNo: "HD-02" }) });
    renderPage();

    const input = await screen.findByLabelText(viOrder.contractNo);
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: "HD-02" } });
    fireEvent.click(
      screen.getByRole("button", { name: viOrder.contract.save }),
    );

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/sales/orders/4", {
        contractNo: "HD-02",
        contractDate: null,
        deliveryDate: "2027-03-01",
      }),
    );
  });

  it("makes the contract fields read-only without order:update", async () => {
    grant(OrderPermission.read, OrderPermission.cancel);
    renderPage();

    expect(await screen.findByLabelText(viOrder.contractNo)).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: viOrder.contract.save }),
    ).toBeNull();
  });

  it("cancels with a reason for a role holding order:cancel", async () => {
    apiPost.mockResolvedValue({
      data: order({ status: "cancelled", cancelReason: "Customer withdrew" }),
    });
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: viOrder.cancel }),
    );
    fireEvent.change(screen.getByPlaceholderText(viOrder.reason.placeholder), {
      target: { value: "Customer withdrew" },
    });
    fireEvent.click(screen.getByRole("button", { name: viOrder.cancelSubmit }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/sales/orders/4/cancel", {
        reason: "Customer withdrew",
      }),
    );
  });

  it("lets a Sales account edit the contract fields but offers it no cancel", async () => {
    grant(OrderPermission.read, OrderPermission.create, OrderPermission.update);
    renderPage();

    expect(await screen.findByLabelText(viOrder.contractNo)).toBeEnabled();
    expect(
      screen.getByRole("button", { name: viOrder.contract.save }),
    ).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: viOrder.cancel })).toBeNull();
  });

  it("locks everything once the order is cancelled and shows why", async () => {
    apiGet.mockResolvedValue({
      data: order({
        status: "cancelled",
        cancelReason: "Customer withdrew",
        cancelledAt: "2026-10-25T10:00:00.000Z",
        cancelledByName: "Manager",
      }),
    });
    renderPage();

    expect(await screen.findByText(/Customer withdrew/)).toBeInTheDocument();
    expect(screen.getByLabelText(viOrder.contractNo)).toBeDisabled();
    expect(screen.queryByRole("button", { name: viOrder.cancel })).toBeNull();
    expect(
      screen.queryByRole("button", { name: viOrder.contract.save }),
    ).toBeNull();
  });

  it("says the order is missing on a 404", async () => {
    apiGet.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    renderPage();

    expect(await screen.findByText(viOrder.detailNotFound)).toBeInTheDocument();
  });
});
