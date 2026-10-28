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
import viItem from "@/kernel/langs/vi/item.json";
import viLocation from "@/kernel/langs/vi/location.json";
import viModal from "@/kernel/langs/vi/modal.json";

import { ItemFormModal } from "@plugins/catalog/item/components/ItemFormModal";
import { ItemPermission } from "@plugins/catalog/item/permissions/item-permission.keys";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const apiPatch = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: apiPatch, delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({ can, permissions: [...granted.value] }),
  useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
}));

const CREATED = { id: 9, code: "LC1D09M7", name: "Contactor", unit: "pcs" };

/** A 409 as the API answers a barcode that another item already holds. */
const barcodeTaken = {
  isAxiosError: true,
  response: {
    status: 409,
    data: {
      error: {
        message:
          "Barcode already exists as the barcode or code of another item.",
      },
    },
  },
};

function renderModal() {
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
          item: viItem,
          location: viLocation,
          modal: viModal,
        }}
      >
        <NotificationProvider>
          <ItemFormModal isOpen onClose={vi.fn()} />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function type(placeholder: string, value: string) {
  fireEvent.change(screen.getByPlaceholderText(placeholder), {
    target: { value },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set([
    ItemPermission.read,
    ItemPermission.create,
    ItemPermission.update,
    ItemPermission.stockSettings,
    ItemPermission.referencePriceRead,
  ]);
  apiGet.mockResolvedValue({ data: null });
  apiPost.mockResolvedValue({ data: CREATED });
  apiPatch.mockResolvedValueOnce({ data: CREATED });
});

afterEach(cleanup);

describe("ItemFormModal", () => {
  it("carries on as an edit of the created item when its barcode is refused, and keeps the barcode error", async () => {
    apiPatch.mockReset();
    apiPatch.mockRejectedValueOnce(barcodeTaken);
    apiPatch.mockResolvedValue({ data: CREATED });
    renderModal();

    type(viItem.placeholders.code, "LC1D09M7");
    type(viItem.placeholders.name, "Contactor");
    type(viItem.placeholders.unit, "pcs");
    type(viItem.placeholders.barcode, "8930001");
    fireEvent.mouseDown(screen.getByPlaceholderText(viItem.placeholders.group));
    fireEvent.mouseDown(
      await screen.findByRole("option", { name: viItem.groups.contactor }),
    );
    fireEvent.click(screen.getByRole("button", { name: viCommon.save }));

    expect(
      await screen.findByText(viItem.validation.barcodeTaken),
    ).toBeInTheDocument();
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPatch).toHaveBeenCalledWith("/items/9/stock-settings", {
      barcode: "8930001",
      defaultLocationId: null,
      minStock: null,
    });
    expect(
      screen.getByText(viItem.editModalTitle.replace("{code}", CREATED.code)),
    ).toBeInTheDocument();

    // Fixing the barcode and saving again updates the item; it never creates a second one.
    type(viItem.placeholders.barcode, "8930002");
    fireEvent.click(screen.getByRole("button", { name: viCommon.save }));

    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(3));
    expect(apiPatch).toHaveBeenCalledWith("/items/9", expect.any(Object));
    expect(apiPatch).toHaveBeenLastCalledWith(
      "/items/9/stock-settings",
      expect.objectContaining({ barcode: "8930002" }),
    );
    expect(apiPost).toHaveBeenCalledTimes(1);
  });
});
