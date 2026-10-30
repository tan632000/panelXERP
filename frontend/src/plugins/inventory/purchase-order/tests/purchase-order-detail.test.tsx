import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import {
  NOTIFICATION_EVENT_KEYS,
  canReadAnyNotification,
  resolveNotificationMessage,
} from "@/kernel/core/hooks/api/useNotifications";
import viCommon from "@/kernel/langs/vi/common.json";
import viModal from "@/kernel/langs/vi/modal.json";
import viPurchaseOrder from "@/kernel/langs/vi/purchaseOrder.json";

import { PurchaseOrderDetailPage } from "@plugins/inventory/purchase-order/components/PurchaseOrderDetailPage";
import { PurchaseOrderPermission } from "@plugins/inventory/purchase-order/permissions/purchase-order-permission.keys";

import type { PurchaseOrderDetail } from "@plugins/inventory/purchase-order/types";

const apiGet = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const actorUser = vi.hoisted(() => ({
  value: { id: 60, role: "director" } as { id: number; role: string },
}));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({
    can,
    permissions: [...granted.value],
    user: actorUser.value,
    logout: vi.fn(),
  }),
  useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "5" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/inventory/purchase-orders/5",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const PURCHASING_ID = 50;
const DIRECTOR_ID = 60;

/** What the API answers someone holding `purchase_price:read`. */
function pricedOrder(
  overrides: Partial<PurchaseOrderDetail> = {},
): PurchaseOrderDetail {
  return {
    id: 5,
    code: "PO_2026_0007",
    supplierId: 3,
    supplierCode: "NCC-01",
    supplierName: "Công ty Điện Nam",
    status: "pending_approval",
    expectedDate: "2026-11-15",
    vatRate: 8,
    subtotal: 1453704,
    vatAmount: 116296,
    total: 1570000,
    note: null,
    createdBy: PURCHASING_ID,
    createdByName: "Mua hàng",
    createdAt: "2026-10-28T08:00:00.000Z",
    submittedAt: "2026-10-28T09:00:00.000Z",
    approvedAt: null,
    editorIds: [],
    submittedBy: PURCHASING_ID,
    approvedBy: null,
    cancelReason: null,
    closeReason: null,
    lines: [
      {
        id: 11,
        lineNo: 1,
        itemId: 101,
        itemCode: "VT-0101",
        itemName: "Aptomat 3P 100A",
        itemUnit: "Cái",
        quantity: 10,
        unitPrice: 100000,
        amount: 1000000,
        receivedQty: 0,
      },
    ],
    events: [
      {
        id: 1,
        event: "submitted",
        actorId: PURCHASING_ID,
        actorName: "Mua hàng",
        reason: null,
        createdAt: "2026-10-28T09:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

/** The same order as a storekeeper receives it: every money key dropped. */
function storekeeperOrder(): PurchaseOrderDetail {
  const order = pricedOrder({
    status: "approved",
  }) as Partial<PurchaseOrderDetail>;
  delete order.vatRate;
  delete order.subtotal;
  delete order.vatAmount;
  delete order.total;
  order.lines = order.lines?.map(
    ({ unitPrice: _price, amount: _amount, ...line }) => line,
  );
  return order as PurchaseOrderDetail;
}

function respond(order: PurchaseOrderDetail) {
  apiGet.mockImplementation((url: string) =>
    url === "/inventory/purchase-orders/5"
      ? Promise.resolve({ data: order })
      : Promise.resolve({ data: { data: [], meta: { total: 0 } } }),
  );
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
          purchaseOrder: viPurchaseOrder,
        }}
      >
        <NotificationProvider>
          <PurchaseOrderDetailPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const DIRECTOR_GRANTS = Object.values(PurchaseOrderPermission);

beforeEach(() => {
  vi.clearAllMocks();
  actorUser.value = { id: DIRECTOR_ID, role: "director" };
  granted.value = new Set(DIRECTOR_GRANTS);
});

afterEach(cleanup);

describe("PurchaseOrderDetailPage", () => {
  it("shows a storekeeper the quantities without a single price column", async () => {
    actorUser.value = { id: 40, role: "storekeeper" };
    granted.value = new Set([PurchaseOrderPermission.read]);
    respond(storekeeperOrder());
    renderPage();

    expect(await screen.findByText("VT-0101")).toBeInTheDocument();
    expect(
      screen.getByText(viPurchaseOrder.lines.quantity),
    ).toBeInTheDocument();
    for (const header of [
      viPurchaseOrder.lines.unitPrice,
      viPurchaseOrder.lines.amount,
      viPurchaseOrder.total,
      viPurchaseOrder.vatRate,
    ]) {
      expect(screen.queryByText(header)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/1\.570\.000/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: viPurchaseOrder.actions.approve }),
    ).not.toBeInTheDocument();
  });

  it("shows prices to a reader the API sent them to", async () => {
    respond(pricedOrder());
    renderPage();

    expect(
      await screen.findByText(viPurchaseOrder.lines.unitPrice),
    ).toBeInTheDocument();
    expect(screen.getByText(viPurchaseOrder.total)).toBeInTheDocument();
  });

  it("offers an uninvolved director approve and reject", async () => {
    respond(pricedOrder());
    renderPage();

    expect(
      await screen.findByRole("button", {
        name: viPurchaseOrder.actions.approve,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: viPurchaseOrder.actions.reject }),
    ).toBeInTheDocument();
  });

  it.each<[string, Partial<PurchaseOrderDetail>]>([
    ["edited the draft", { editorIds: [DIRECTOR_ID] }],
    ["created it", { createdBy: DIRECTOR_ID }],
    ["submitted it", { submittedBy: DIRECTOR_ID }],
    [
      "submitted it before a rejection",
      {
        events: [
          {
            id: 1,
            event: "submitted",
            actorId: DIRECTOR_ID,
            actorName: "Giám đốc",
            reason: null,
            createdAt: "2026-10-28T08:30:00.000Z",
          },
          {
            id: 2,
            event: "rejected",
            actorId: 70,
            actorName: "Giám đốc 2",
            reason: "Sai số lượng",
            createdAt: "2026-10-28T08:45:00.000Z",
          },
          {
            id: 3,
            event: "submitted",
            actorId: PURCHASING_ID,
            actorName: "Mua hàng",
            reason: null,
            createdAt: "2026-10-28T09:00:00.000Z",
          },
        ],
      },
    ],
  ])(
    "hides approve from a director who %s, and says why",
    async (_case, overrides) => {
      respond(pricedOrder(overrides));
      renderPage();

      expect(
        await screen.findByText(viPurchaseOrder.actions.involvedCannotDecide),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: viPurchaseOrder.actions.approve }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: viPurchaseOrder.actions.reject }),
      ).not.toBeInTheDocument();
    },
  );

  it("locks what a request line orders and leaves the order's own line editable", async () => {
    actorUser.value = { id: PURCHASING_ID, role: "purchasing" };
    const requestLine = { ...pricedOrder().lines[0], fromRequest: true };
    respond(
      pricedOrder({
        status: "draft",
        submittedBy: null,
        submittedAt: null,
        lines: [
          requestLine,
          {
            ...requestLine,
            id: 12,
            lineNo: 2,
            itemId: 102,
            itemCode: "VT-0102",
            quantity: 2,
            fromRequest: false,
          },
        ],
      }),
    );
    renderPage();

    expect(
      await screen.findByRole("textbox", {
        name: viPurchaseOrder.lines.quantityOf.replace("{code}", "VT-0102"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", {
        name: viPurchaseOrder.lines.quantityOf.replace("{code}", "VT-0101"),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: viPurchaseOrder.lines.remove.replace("{code}", "VT-0101"),
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: viPurchaseOrder.lines.remove.replace("{code}", "VT-0102"),
      }),
    ).toBeInTheDocument();
    // The price of a request line stays open: repricing is what the server allows.
    expect(
      screen.getByRole("textbox", {
        name: viPurchaseOrder.lines.unitPriceOf.replace("{code}", "VT-0101"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(viPurchaseOrder.lines.fromRequestHint),
    ).toBeInTheDocument();
  });

  it("lists the rejection reason in the history", async () => {
    respond(
      pricedOrder({
        status: "draft",
        submittedBy: null,
        events: [
          {
            id: 1,
            event: "submitted",
            actorId: PURCHASING_ID,
            actorName: "Mua hàng",
            reason: null,
            createdAt: "2026-10-28T09:00:00.000Z",
          },
          {
            id: 2,
            event: "rejected",
            actorId: DIRECTOR_ID,
            actorName: "Giám đốc",
            reason: "Giá cao",
            createdAt: "2026-10-28T10:00:00.000Z",
          },
        ],
      }),
    );
    renderPage();

    expect(
      await screen.findByText(
        viPurchaseOrder.history.reason.replace("{reason}", "Giá cao"),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(viPurchaseOrder.history.events.rejected),
    ).toBeInTheDocument();
  });
});

describe("purchase order notifications", () => {
  const t = createTranslator({
    locale: "vi",
    messages: { common: viCommon },
    namespace: "common.notification",
  });

  it("reaches the directors and the creator through the order scopes", () => {
    expect(canReadAnyNotification(["purchase_order:approve"])).toBe(true);
    expect(canReadAnyNotification(["purchase_order:read"])).toBe(true);
  });

  it.each([
    ["inventory.purchase_order.submitted", ["PO_2026_0007"]],
    ["inventory.purchase_order.approved", ["PO_2026_0007"]],
    ["inventory.purchase_order.rejected", ["PO_2026_0007", "Giá cao"]],
  ] as const)("phrases %s from its payload", (eventType, parts) => {
    expect(NOTIFICATION_EVENT_KEYS).toContain(eventType);
    const message = resolveNotificationMessage({
      eventType,
      message: "fallback",
      payload: { purchaseOrderId: 5, code: "PO_2026_0007", reason: "Giá cao" },
    });
    expect(message.kind).toBe("key");
    if (message.kind !== "key") return;
    const text = t(message.key as Parameters<typeof t>[0], message.values);
    for (const part of parts) expect(text).toContain(part);
  });
});
