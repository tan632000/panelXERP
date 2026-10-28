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

import { Toaster } from "@/kernel/core/components/ui/Toaster";
import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viItem from "@/kernel/langs/vi/item.json";
import viModal from "@/kernel/langs/vi/modal.json";

import { getExcelAction, queryExcelAction } from "@/test/helpers/excel-menu";

import { ItemListPage } from "@plugins/catalog/item/components/ItemListPage";
import { ItemPermission } from "@plugins/catalog/item/permissions/item-permission.keys";

const apiGet = vi.hoisted(() => vi.fn());
const apiPatch = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);
const downloadBlob = vi.hoisted(() => vi.fn());
const searchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: vi.fn(), patch: apiPatch, delete: vi.fn() },
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

vi.mock("@/kernel/core/lib/download-blob", () => ({ downloadBlob }));

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
    if (url === "/items/resolve") {
      return Promise.resolve({ data: { id: ITEM.id, code: ITEM.code } });
    }
    if (url === `/items/${ITEM.id}`) return Promise.resolve({ data: ITEM });
    if (url === "/items/labels.pdf") {
      return Promise.resolve({ data: new Blob(["%PDF-"]) });
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
          <Toaster />
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

  describe("scan and labels", () => {
    const scan = (code: string) => {
      const field = screen.getByPlaceholderText(viItem.scan.placeholder);
      fireEvent.change(field, { target: { value: code } });
      fireEvent.keyDown(field, { key: "Enter" });
    };

    it("opens the form of the scanned item for an editor", async () => {
      grant(ItemPermission.read, ItemPermission.stockSettings);
      renderPage();
      await screen.findByText("LC1D09M7");

      scan(" 8930001 ");

      expect(
        await screen.findByText(
          viItem.editModalTitle.replace("{code}", ITEM.code),
        ),
      ).toBeInTheDocument();
      expect(apiGet).toHaveBeenCalledWith("/items/resolve", {
        params: { code: "8930001" },
      });
    });

    it("filters the list to the scanned code for a reader who cannot edit", async () => {
      renderPage();
      await screen.findByText("LC1D09M7");

      scan("8930001");

      await waitFor(() =>
        expect(apiGet).toHaveBeenCalledWith(
          "/items",
          expect.objectContaining({
            params: expect.objectContaining({ search: "LC1D09M7" }),
          }),
        ),
      );
    });

    it("says so inline when no item has the scanned code", async () => {
      const answer = apiGet.getMockImplementation() as (
        url: string,
      ) => Promise<unknown>;
      apiGet.mockImplementation((url: string) =>
        url === "/items/resolve"
          ? Promise.reject({ isAxiosError: true, response: { status: 404 } })
          : answer(url),
      );
      renderPage();

      scan("NOPE");

      expect(await screen.findByRole("alert")).toHaveTextContent(
        viItem.scan.notFound,
      );
    });

    it("prints the copies asked for from the item form", async () => {
      grant(ItemPermission.read, ItemPermission.stockSettings);
      renderPage();
      await screen.findByText("LC1D09M7");
      scan("8930001");
      await screen.findByText(
        viItem.editModalTitle.replace("{code}", ITEM.code),
      );

      fireEvent.change(screen.getByLabelText(viItem.labels.copies), {
        target: { value: "3" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: viItem.labels.button }),
      );

      await waitFor(() =>
        expect(apiGet).toHaveBeenCalledWith("/items/labels.pdf", {
          params: { ids: "3", copies: 3 },
          responseType: "blob",
        }),
      );
    });

    it("keeps the scan box disabled while the form is open and takes the focus back when it closes", async () => {
      grant(ItemPermission.read, ItemPermission.stockSettings);
      renderPage();
      await screen.findByText("LC1D09M7");
      const field = screen.getByPlaceholderText(viItem.scan.placeholder);
      scan("8930001");
      await screen.findByText(
        viItem.editModalTitle.replace("{code}", ITEM.code),
      );

      expect(field).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: viCommon.cancel }));

      await waitFor(() => expect(field).toBeEnabled());
      await waitFor(() => expect(field).toHaveFocus());
    });

    it("prints on Enter in the copies field without saving or closing the form", async () => {
      grant(ItemPermission.read, ItemPermission.stockSettings);
      renderPage();
      await screen.findByText("LC1D09M7");
      scan("8930001");
      const title = viItem.editModalTitle.replace("{code}", ITEM.code);
      await screen.findByText(title);

      const copies = screen.getByLabelText(viItem.labels.copies);
      fireEvent.change(copies, { target: { value: "2" } });
      fireEvent.keyDown(copies, { key: "Enter" });

      await waitFor(() =>
        expect(apiGet).toHaveBeenCalledWith("/items/labels.pdf", {
          params: { ids: "3", copies: 2 },
          responseType: "blob",
        }),
      );
      expect(apiPatch).not.toHaveBeenCalled();
      expect(screen.getByText(title)).toBeInTheDocument();
    });

    it.each([
      [404, "Item 3 not found", viItem.toast.labelsMissing],
      [
        422,
        'Item code "X" is too long to print as a scannable 50x30 mm label',
        viItem.toast.labelsTooLong,
      ],
      [
        422,
        "Code 128 labels carry printable ASCII only",
        viItem.toast.labelsUnprintable,
      ],
      [
        400,
        "Too many labels: ids x copies is at most 500, and copies is at least 1.",
        viItem.toast.labelsTooMany,
      ],
    ])(
      "explains a %s from the labels request as its own toast",
      async (status, message, toast) => {
        const answer = apiGet.getMockImplementation() as (
          url: string,
        ) => Promise<unknown>;
        apiGet.mockImplementation((url: string) =>
          url === "/items/labels.pdf"
            ? Promise.reject({
                isAxiosError: true,
                response: {
                  status,
                  data: new Blob([JSON.stringify({ error: { message } })]),
                },
              })
            : answer(url),
        );
        renderPage();
        await screen.findByText("LC1D09M7");

        fireEvent.click(screen.getAllByRole("checkbox")[1]);
        fireEvent.click(
          await screen.findByRole("button", {
            name: new RegExp(viItem.labels.button),
          }),
        );

        expect(await screen.findByText(toast)).toBeInTheDocument();
      },
    );

    it("downloads the labels of the ticked rows", async () => {
      renderPage();
      await screen.findByText("LC1D09M7");

      fireEvent.click(screen.getAllByRole("checkbox")[1]);
      fireEvent.click(
        await screen.findByRole("button", {
          name: new RegExp(viItem.labels.button),
        }),
      );

      await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
      expect(apiGet).toHaveBeenCalledWith("/items/labels.pdf", {
        params: { ids: "3", copies: 1 },
        responseType: "blob",
      });
    });
  });
});
