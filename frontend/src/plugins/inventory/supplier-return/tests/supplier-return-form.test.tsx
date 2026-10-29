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
import viSupplierReturn from "@/kernel/langs/vi/supplierReturn.json";

import { SupplierReturnForm } from "@plugins/inventory/supplier-return/components/SupplierReturnForm";

import type { PurchaseOrderDetail } from "@plugins/inventory/purchase-order/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => {
  const can = () => true;
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
  usePathname: () => "/inventory/supplier-returns/new",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

/** A partly received order as a storekeeper reads it: X 3 of 10 received, Y nothing yet. */
function partlyReceived(): PurchaseOrderDetail {
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
        itemCode: "VT-X",
        itemName: "Aptomat 3P",
        itemUnit: "Cái",
        quantity: 10,
        receivedQty: 3,
      },
      {
        id: 12,
        lineNo: 2,
        itemId: 102,
        itemCode: "VT-Y",
        itemName: "Cáp 4x16",
        itemUnit: "m",
        quantity: 5,
        receivedQty: 0,
      },
    ],
    events: [],
  };
}

const SCANS: Record<string, { id: number }> = {
  "893-X": { id: 101 },
  "893-Q": { id: 999 },
};

beforeEach(() => {
  vi.clearAllMocks();
  apiGet.mockImplementation(
    (url: string, config?: { params?: { code?: string } }) => {
      if (url === "/inventory/purchase-orders/5") {
        return Promise.resolve({ data: partlyReceived() });
      }
      if (url === "/items/resolve") {
        const item = SCANS[config?.params?.code ?? ""];
        return item
          ? Promise.resolve({ data: item })
          : Promise.reject({ isAxiosError: true, response: { status: 404 } });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    },
  );
});

afterEach(cleanup);

function renderForm() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, supplierReturn: viSupplierReturn }}
      >
        <NotificationProvider>
          <SupplierReturnForm />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

async function scanField(): Promise<HTMLInputElement> {
  return (await screen.findByPlaceholderText(
    viSupplierReturn.scan.placeholder,
  )) as HTMLInputElement;
}

/** What a keyboard-wedge scanner does: types the code, then Enter. */
function scan(field: HTMLInputElement, code: string) {
  fireEvent.change(field, { target: { value: code } });
  fireEvent.keyDown(field, { key: "Enter" });
}

const returningOf = (code: string) =>
  screen.getByLabelText(
    viSupplierReturn.lines.returningOf.replace("{code}", code),
  ) as HTMLInputElement;
const submitButton = () =>
  screen.getByRole("button", { name: viSupplierReturn.submit });

describe("SupplierReturnForm", () => {
  it("lists only the received lines and refuses an item not on the order, keeping the focus", async () => {
    renderForm();
    const field = await scanField();
    expect(returningOf("VT-X")).toBeInTheDocument();
    expect(
      screen.queryByLabelText(
        viSupplierReturn.lines.returningOf.replace("{code}", "VT-Y"),
      ),
    ).not.toBeInTheDocument();

    scan(field, "893-Q");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      viSupplierReturn.scan.notOnOrder,
    );
    expect(field).toHaveFocus();
  });

  it("adds one per scan up to what was received", async () => {
    renderForm();
    const field = await scanField();

    for (const expected of ["1", "2", "3"]) {
      scan(field, "893-X");
      await waitFor(() => expect(returningOf("VT-X").value).toBe(expected));
    }
    scan(field, "893-X");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      viSupplierReturn.scan.nothingReceived,
    );
    expect(returningOf("VT-X").value).toBe("3");
  });

  it("blocks more than received and a missing reason, then posts once", async () => {
    let answer!: (value: unknown) => void;
    apiPost.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    renderForm();
    await scanField();

    fireEvent.change(returningOf("VT-X"), { target: { value: "4" } });
    expect(
      await screen.findByText(viSupplierReturn.lines.overReceived),
    ).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();

    fireEvent.change(returningOf("VT-X"), { target: { value: "2" } });
    // No reason yet.
    await waitFor(() =>
      expect(
        screen.queryByText(viSupplierReturn.lines.overReceived),
      ).not.toBeInTheDocument(),
    );
    expect(submitButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(viSupplierReturn.reason), {
      target: { value: "Hàng móp méo" },
    });
    await waitFor(() => expect(submitButton()).toBeEnabled());
    fireEvent.click(submitButton());
    await waitFor(() => expect(submitButton()).toBeDisabled());
    fireEvent.click(submitButton());

    expect(apiPost).toHaveBeenCalledTimes(1);
    const [url, body] = apiPost.mock.calls[0] as [
      string,
      {
        purchaseOrderId: number;
        requestKey: string;
        reason: string;
        lines: unknown[];
      },
    ];
    expect(url).toBe("/inventory/supplier-returns");
    expect(body).toMatchObject({
      purchaseOrderId: 5,
      reason: "Hàng móp méo",
      lines: [{ poLineId: 11, quantity: 2 }],
    });
    expect(body.requestKey).toMatch(/^[0-9a-f-]{36}$/);

    answer({ data: { id: 9 } });
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/inventory/purchase-orders/5"),
    );
  });
});
