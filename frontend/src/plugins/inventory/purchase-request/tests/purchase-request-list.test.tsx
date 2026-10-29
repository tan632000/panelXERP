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
import viPurchaseRequest from "@/kernel/langs/vi/purchaseRequest.json";

import { PurchaseRequestListPage } from "@plugins/inventory/purchase-request/components/PurchaseRequestListPage";

import type { PurchaseRequest } from "@plugins/inventory/purchase-request/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
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
      user: { id: 50, role: "purchasing" },
      logout: vi.fn(),
    }),
    useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/inventory/purchase-requests",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

/** PR1: X for O3 with 4 of 10 remaining; PR2: Y fully ordered. */
const REQUESTS: PurchaseRequest[] = [
  {
    id: 1,
    code: "PR_2026_0001",
    status: "open",
    note: null,
    cancelReason: null,
    createdBy: 50,
    createdByName: "Mua hàng",
    createdAt: "2026-10-29T08:00:00.000Z",
    lines: [
      {
        id: 11,
        lineNo: 1,
        itemId: 101,
        itemCode: "VT-X",
        itemName: "Aptomat 3P",
        itemUnit: "Cái",
        quantity: 10,
        neededBy: null,
        note: null,
        sourceOrderId: 3,
        sourceOrderCode: "DH_2026_0003",
        ordered: 6,
        remaining: 4,
      },
    ],
  },
  {
    id: 2,
    code: "PR_2026_0002",
    status: "ordered",
    note: null,
    cancelReason: null,
    createdBy: 50,
    createdByName: "Mua hàng",
    createdAt: "2026-10-29T09:00:00.000Z",
    lines: [
      {
        id: 21,
        lineNo: 1,
        itemId: 102,
        itemCode: "VT-Y",
        itemName: "Cáp 4x16",
        itemUnit: "m",
        quantity: 5,
        neededBy: null,
        note: null,
        sourceOrderId: null,
        sourceOrderCode: null,
        ordered: 5,
        remaining: 0,
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set([
    "purchase_request:read",
    "purchase_request:create",
    "purchase_order:create",
  ]);
  apiGet.mockImplementation((url: string) => {
    if (url === "/inventory/purchase-requests") {
      return Promise.resolve({
        data: { data: REQUESTS, meta: { total: 2, page: 1, limit: 20, totalPages: 1 } },
      });
    }
    if (url === "/inventory/suppliers") {
      return Promise.resolve({
        data: { data: [{ id: 7, code: "NCC-01", name: "Công ty Điện Nam" }] },
      });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
});

afterEach(cleanup);

function renderPage() {
  render(
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
          purchaseRequest: viPurchaseRequest,
        }}
      >
        <NotificationProvider>
          <PurchaseRequestListPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const selectLabel = (code: string, request: string) =>
  viPurchaseRequest.selectLine.replace("{code}", code).replace("{request}", request);

describe("PurchaseRequestListPage", () => {
  it("shows what each line has remaining and offers only open lines to order", async () => {
    renderPage();

    expect(await screen.findByText("DH_2026_0003")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(
      screen.getByLabelText(selectLabel("VT-X", "PR_2026_0001")),
    ).toBeInTheDocument();
    // Fully ordered: nothing left to select.
    expect(
      screen.queryByLabelText(selectLabel("VT-Y", "PR_2026_0002")),
    ).not.toBeInTheDocument();
  });

  it("orders the selected lines for what they still have remaining, from one supplier", async () => {
    apiPost.mockResolvedValue({ data: { id: 40, code: "PO_2026_0040" } });
    renderPage();
    const submit = () =>
      screen.getByRole("button", {
        name: viPurchaseRequest.order.submit.replace("{count}", String(count)),
      });
    let count = 0;

    await screen.findByText("DH_2026_0003");
    expect(submit()).toBeDisabled();
    fireEvent.click(screen.getByLabelText(selectLabel("VT-X", "PR_2026_0001")));
    count = 1;
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "NCC-01 — Công ty Điện Nam" })).toBeInTheDocument(),
    );
    // No supplier yet.
    expect(submit()).toBeDisabled();
    fireEvent.change(screen.getByLabelText(viPurchaseRequest.order.supplier), {
      target: { value: "7" },
    });
    fireEvent.click(submit());

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/inventory/purchase-orders/from-requests", {
        supplierId: 7,
        lines: [{ prLineId: 11, quantity: 4 }],
      }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/inventory/purchase-orders/40"),
    );
  });

  it("hides ordering from a reader who cannot create purchase orders", async () => {
    granted.value = new Set(["purchase_request:read", "purchase_request:create"]);
    renderPage();

    await screen.findByText("DH_2026_0003");
    expect(
      screen.queryByLabelText(selectLabel("VT-X", "PR_2026_0001")),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(viPurchaseRequest.order.title)).not.toBeInTheDocument();
  });
});
