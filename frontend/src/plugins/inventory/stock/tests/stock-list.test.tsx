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
import viStock from "@/kernel/langs/vi/stock.json";

import { StockListPage } from "@plugins/inventory/stock/components/StockListPage";
import { StockPermission } from "@plugins/inventory/stock/permissions/stock-permission.keys";

const apiGet = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);
const searchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({
    can,
    permissions: [...granted.value],
    user: { id: 40, role: "storekeeper" },
    logout: vi.fn(),
  }),
  useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.value,
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/inventory/stock",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

/** What a storekeeper receives: quantities only, no cost keys at all. */
const STOREKEEPER_ROW = {
  itemId: 7,
  code: "VT-0007",
  name: "Aptomat 3P 100A",
  unit: "Cái",
  defaultLocationId: 3,
  locationCode: "A-01-02",
  locationName: "Kệ A",
  onHand: 11.5,
  reserved: 2,
  available: 9.5,
  minStock: 12,
  low: true,
};

const MOVEMENT = {
  id: "41",
  movementType: "receipt",
  quantity: 10,
  onHandAfter: 10,
  documentType: "stock_receipt",
  documentId: 1,
  orderId: null,
  reason: null,
  createdByName: "Thủ kho",
  createdAt: "2026-10-28T08:15:00.000Z",
};

function respond(row: Record<string, unknown> = STOREKEEPER_ROW) {
  apiGet.mockImplementation((url: string) => {
    if (url === "/inventory/stock") {
      return Promise.resolve({
        data: {
          data: [row],
          meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
        },
      });
    }
    if (url === "/inventory/stock/7/movements") {
      return Promise.resolve({
        data: {
          data: [MOVEMENT],
          meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
      });
    }
    return Promise.resolve({ data: null });
  });
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
        messages={{ common: viCommon, stock: viStock, modal: viModal }}
      >
        <NotificationProvider>
          <StockListPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function grant(...permissions: string[]) {
  granted.value = new Set(permissions);
}

const ledgerCalls = () =>
  apiGet.mock.calls.filter(([url]) => String(url).endsWith("/movements"));

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  searchParams.value = new URLSearchParams();
  grant(StockPermission.read, StockPermission.ledger);
  respond();
});

afterEach(cleanup);

describe("StockListPage", () => {
  it("lists on hand, reserved, available and the location of each item", async () => {
    renderPage();

    expect(await screen.findByText("VT-0007")).toBeInTheDocument();
    expect(screen.getByText("Aptomat 3P 100A")).toBeInTheDocument();
    expect(screen.getByText("A-01-02")).toBeInTheDocument();
    expect(screen.getByText("11,5")).toBeInTheDocument();
    expect(screen.getByText(viStock.lowBadge)).toBeInTheDocument();
  });

  it("hides the ledger drawer from an actor without stock:ledger", async () => {
    grant(StockPermission.read);
    renderPage();
    const code = await screen.findByText("VT-0007");

    expect(screen.queryByTitle(viStock.openLedger)).not.toBeInTheDocument();
    fireEvent.doubleClick(code);
    fireEvent.click(code);
    expect(
      screen.queryByText(viStock.ledger.title.replace("{code}", "VT-0007")),
    ).not.toBeInTheDocument();
    expect(ledgerCalls()).toHaveLength(0);
  });

  it("opens the ledger of the item for an actor holding stock:ledger", async () => {
    renderPage();
    await screen.findByText("VT-0007");

    fireEvent.click(screen.getByTitle(viStock.openLedger));

    expect(
      await screen.findByText(
        viStock.ledger.title.replace("{code}", "VT-0007"),
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(viStock.movementType.receipt),
    ).toBeInTheDocument();
    expect(screen.getByText("Thủ kho")).toBeInTheDocument();
    expect(ledgerCalls()[0][0]).toBe("/inventory/stock/7/movements");
  });

  it("shows no cost column when the API sends no cost", async () => {
    renderPage();
    await screen.findByText("VT-0007");

    expect(screen.queryByText(viStock.avgCost)).not.toBeInTheDocument();
    expect(screen.queryByText(viStock.value)).not.toBeInTheDocument();
  });

  it("shows the cost columns when the API sends them", async () => {
    respond({ ...STOREKEEPER_ROW, avgCost: 112883.6522, value: 1298162 });
    renderPage();
    await screen.findByText("VT-0007");

    expect(screen.getByText(viStock.avgCost)).toBeInTheDocument();
    expect(screen.getByText(viStock.value)).toBeInTheDocument();
  });

  it("asks for low stock only when the filter is ticked", async () => {
    renderPage();
    await screen.findByText("VT-0007");
    const firstList = apiGet.mock.calls.find(
      ([url]) => url === "/inventory/stock",
    );
    expect(firstList?.[1]).toMatchObject({ params: { lowOnly: undefined } });

    fireEvent.click(screen.getByLabelText(viStock.lowOnly));

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith("/inventory/stock", {
        params: expect.objectContaining({ lowOnly: true, page: 1 }),
      }),
    );
  });
});
