import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viItem from "@/kernel/langs/vi/item.json";
import viModal from "@/kernel/langs/vi/modal.json";

import { getExcelAction, queryExcelAction } from "@/test/helpers/excel-menu";

import { ItemListPage } from "@plugins/catalog/item/components/ItemListPage";
import { ItemPermission } from "@plugins/catalog/item/permissions/item-permission.keys";

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
    user: { id: 40, role: "purchasing" },
    logout: vi.fn(),
  }),
  useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.value,
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/catalog/items",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const ITEM = {
  id: 3,
  code: "LC1D09M7",
  name: "Contactor 9A",
  specification: null,
  brand: "Schneider",
  group: "contactor",
  unit: "Cái",
  referencePrice: 450000,
  barcode: "8930001",
  defaultLocation: { id: 2, code: "A-01-02", name: "Shelf A1" },
  minStock: 5,
  note: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function respond() {
  apiGet.mockImplementation((url: string) => {
    if (url === "/items") {
      return Promise.resolve({
        data: {
          data: [ITEM],
          meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
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
        messages={{ common: viCommon, item: viItem, modal: viModal }}
      >
        <NotificationProvider>
          <ItemListPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function grant(...permissions: string[]) {
  granted.value = new Set(permissions);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  searchParams.value = new URLSearchParams();
  grant(ItemPermission.read, ItemPermission.referencePriceRead);
  respond();
});

afterEach(cleanup);

describe("ItemListPage", () => {
  it("lists the items the API returns, with the group label and the formatted price", async () => {
    renderPage();

    expect(await screen.findByText("LC1D09M7")).toBeInTheDocument();
    expect(screen.getByText("Contactor 9A")).toBeInTheDocument();
    expect(screen.getByText(viItem.groups.contactor)).toBeInTheDocument();
    expect(screen.getByText("450.000")).toBeInTheDocument();
  });

  it("shows the barcode, default location and minimum stock columns", async () => {
    renderPage();
    await screen.findByText("LC1D09M7");

    expect(screen.getByText("8930001")).toBeInTheDocument();
    expect(screen.getByText("A-01-02")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("hides the reference price column from an actor without reference_price:read", async () => {
    grant(ItemPermission.read);
    renderPage();
    await screen.findByText("LC1D09M7");

    expect(screen.queryByText(viItem.referencePrice)).not.toBeInTheDocument();
    expect(screen.queryByText("450.000")).not.toBeInTheDocument();
  });

  it("lets a holder of item:stock_settings alone open the edit control", async () => {
    grant(ItemPermission.read, ItemPermission.stockSettings);
    renderPage();
    await screen.findByText("LC1D09M7");

    expect(screen.getByTitle(viCommon.edit)).toBeInTheDocument();
    expect(screen.queryByTitle(viCommon.delete)).not.toBeInTheDocument();
  });

  it("hides create and import from a reader holding only item:read", async () => {
    renderPage();
    await screen.findByText("LC1D09M7");

    expect(screen.queryByText(viItem.addButton)).not.toBeInTheDocument();
    expect(queryExcelAction(viCommon.importExcel)).toBeNull();
    expect(screen.queryByTitle(viCommon.edit)).not.toBeInTheDocument();
    expect(screen.queryByTitle(viCommon.delete)).not.toBeInTheDocument();
  });

  it("shows create only with item:create, and import only with item:import", async () => {
    grant(ItemPermission.read, ItemPermission.create);
    const { unmount } = renderPage();
    await screen.findByText("LC1D09M7");
    expect(screen.getByText(viItem.addButton)).toBeInTheDocument();
    expect(queryExcelAction(viCommon.importExcel)).toBeNull();
    unmount();

    grant(ItemPermission.read, ItemPermission.import);
    renderPage();
    await screen.findByText("LC1D09M7");
    expect(screen.queryByText(viItem.addButton)).not.toBeInTheDocument();
    expect(queryExcelAction(viCommon.importExcel)).not.toBeNull();
  });

  it("opens the import dialog when the toolbar import button is clicked", async () => {
    grant(ItemPermission.read, ItemPermission.import);
    renderPage();
    await screen.findByText("LC1D09M7");
    expect(
      screen.queryByRole("button", { name: viItem.import.submit }),
    ).not.toBeInTheDocument();

    fireEvent.click(getExcelAction(viCommon.importExcel));

    expect(
      await screen.findByRole("button", { name: viItem.import.submit }),
    ).toBeInTheDocument();
  });

  it("offers the row edit and delete controls only with item:update and item:delete", async () => {
    grant(ItemPermission.read, ItemPermission.update, ItemPermission.delete);
    renderPage();
    await screen.findByText("LC1D09M7");

    expect(screen.getByTitle(viCommon.edit)).toBeInTheDocument();
    expect(screen.getByTitle(viCommon.delete)).toBeInTheDocument();
  });
});
