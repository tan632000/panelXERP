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
import viReceipt from "@/kernel/langs/vi/receipt.json";

import { ReceiveScreen } from "@plugins/inventory/receipt/components/ReceiveScreen";

import type { PurchaseOrderDetail } from "@plugins/inventory/purchase-order/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => {
  const can = (permission: string) =>
    ["stock_receipt:create", "purchase_order:read"].includes(permission);
  return {
    useAuth: () => ({
      can,
      permissions: [],
      user: { id: 40, role: "storekeeper" },
      logout: vi.fn(),
    }),
    useOptionalAuth: () => ({ can, permissions: [] }),
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams("purchaseOrderId=5"),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/inventory/receipts/new",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

/** An approved order as a storekeeper reads it: no price key. */
function approvedOrder(): PurchaseOrderDetail {
  return {
    id: 5,
    code: "PO_2026_0007",
    supplierId: 3,
    supplierCode: "NCC-01",
    supplierName: "Công ty Điện Nam",
    status: "partially_received",
    expectedDate: null,
    note: null,
    createdBy: 50,
    createdByName: "Mua hàng",
    createdAt: "2026-10-28T08:00:00.000Z",
    submittedAt: "2026-10-28T09:00:00.000Z",
    approvedAt: "2026-10-28T10:00:00.000Z",
    editorIds: [],
    submittedBy: 50,
    approvedBy: 60,
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
        quantity: 3,
        receivedQty: 1,
      },
      {
        id: 12,
        lineNo: 2,
        itemId: 102,
        itemCode: "VT-0102",
        itemName: "Cáp đồng 4x16",
        itemUnit: "m",
        quantity: 0.3,
        receivedQty: 0.1,
      },
    ],
    events: [],
  };
}

const ITEMS_BY_CODE: Record<string, { id: number; code: string }> = {
  "8930001": { id: 101, code: "VT-0101" },
  "8930099": { id: 999, code: "VT-0999" },
};

beforeEach(() => {
  vi.clearAllMocks();
  apiGet.mockImplementation(
    (url: string, config?: { params?: { code?: string } }) => {
      if (url === "/inventory/purchase-orders/5") {
        return Promise.resolve({ data: approvedOrder() });
      }
      if (url === "/items/resolve") {
        const item = ITEMS_BY_CODE[config?.params?.code ?? ""];
        return item
          ? Promise.resolve({ data: item })
          : Promise.reject({ response: { status: 404 } });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    },
  );
});

afterEach(cleanup);

function renderScreen() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, receipt: viReceipt }}
      >
        <NotificationProvider>
          <ReceiveScreen />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

async function scanField(): Promise<HTMLInputElement> {
  return (await screen.findByPlaceholderText(
    viReceipt.scan.placeholder,
  )) as HTMLInputElement;
}

/** What a keyboard-wedge scanner does: types the code, then Enter. */
function scan(field: HTMLInputElement, code: string) {
  fireEvent.change(field, { target: { value: code } });
  fireEvent.keyDown(field, { key: "Enter" });
}

const quantityOf = (code: string) =>
  screen.getByLabelText(
    viReceipt.lines.thisReceiptOf.replace("{code}", code),
  ) as HTMLInputElement;

const submitButton = () =>
  screen.getByRole("button", { name: viReceipt.receive.submit });

describe("ReceiveScreen", () => {
  it("shows the remaining of each line in decimals, not floats", async () => {
    renderScreen();
    await scanField();
    // 0.3 − 0.1: a float subtraction would print 0,19999999999999998.
    expect(screen.getByText("0,2")).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it("refuses an item not on the order under the field and keeps the focus", async () => {
    renderScreen();
    const field = await scanField();

    scan(field, "8930099");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      viReceipt.scan.notOnOrder,
    );
    expect(field).toHaveFocus();
    expect(quantityOf("VT-0101").value).toBe("");
  });

  it("adds one per scan and refuses a scan beyond what remains", async () => {
    renderScreen();
    const field = await scanField();

    scan(field, "8930001");
    await waitFor(() => expect(quantityOf("VT-0101").value).toBe("1"));
    scan(field, "8930001");
    await waitFor(() => expect(quantityOf("VT-0101").value).toBe("2"));

    // 3 ordered, 1 received: a third scan would exceed the 2 remaining.
    scan(field, "8930001");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      viReceipt.scan.beyondRemaining,
    );
    expect(quantityOf("VT-0101").value).toBe("2");
    expect(field).toHaveFocus();
  });

  it("blocks a typed quantity beyond the remaining", async () => {
    renderScreen();
    await scanField();

    fireEvent.change(quantityOf("VT-0102"), { target: { value: "0,3" } });

    expect(
      await screen.findByText(
        viReceipt.lines.overRemaining.replace("{remaining}", "0,2"),
      ),
    ).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it("posts once with one request key, however often it is pressed", async () => {
    let answer!: (value: unknown) => void;
    apiPost.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    renderScreen();
    await scanField();
    fireEvent.change(quantityOf("VT-0102"), { target: { value: "0,2" } });

    fireEvent.click(submitButton());
    await waitFor(() => expect(submitButton()).toBeDisabled());
    fireEvent.click(submitButton());

    expect(apiPost).toHaveBeenCalledTimes(1);
    const [url, body] = apiPost.mock.calls[0] as [
      string,
      { purchaseOrderId: number; requestKey: string; lines: unknown[] },
    ];
    expect(url).toBe("/inventory/receipts");
    expect(body.purchaseOrderId).toBe(5);
    expect(body.requestKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.lines).toEqual([{ poLineId: 12, quantity: 0.2 }]);

    answer({ data: { id: 9 } });
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/inventory/purchase-orders/5"),
    );
  });
});
