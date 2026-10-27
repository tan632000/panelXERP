import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viModal from "@/kernel/langs/vi/modal.json";
import viSupplier from "@/kernel/langs/vi/supplier.json";

import { SupplierListPage } from "@plugins/inventory/supplier/components/SupplierListPage";
import { SupplierPermission } from "@plugins/inventory/supplier/permissions/supplier-permission.keys";

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
  usePathname: () => "/inventory/suppliers",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const SUPPLIER = {
  id: 7,
  code: "NCC_0007",
  name: "Thep Viet",
  taxCode: "0101234567",
  address: null,
  phone: "0901234567",
  email: "sales@thepviet.vn",
  contactName: "Anh Nam",
  note: null,
  isActive: true,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function respond() {
  apiGet.mockImplementation((url: string) => {
    if (url === "/inventory/suppliers") {
      return Promise.resolve({
        data: {
          data: [SUPPLIER],
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
        messages={{
          common: viCommon,
          supplier: viSupplier,
          modal: viModal,
        }}
      >
        <NotificationProvider>
          <SupplierListPage />
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
  grant(SupplierPermission.read);
  respond();
});

afterEach(cleanup);

describe("SupplierListPage", () => {
  it("lists the suppliers the API returns, with their contact and status", async () => {
    renderPage();

    expect(await screen.findByText("NCC_0007")).toBeInTheDocument();
    expect(screen.getByText("Thep Viet")).toBeInTheDocument();
    expect(screen.getByText("Anh Nam")).toBeInTheDocument();
    expect(screen.getByText(viSupplier.statusActive)).toBeInTheDocument();
  });

  it("hides the create button from an actor without supplier:create", async () => {
    renderPage();
    await screen.findByText("NCC_0007");

    expect(screen.queryByText(viSupplier.addButton)).not.toBeInTheDocument();
  });

  it("shows the create button to an actor holding supplier:create", async () => {
    grant(SupplierPermission.read, SupplierPermission.create);
    renderPage();
    await screen.findByText("NCC_0007");

    expect(screen.getByText(viSupplier.addButton)).toBeInTheDocument();
  });

  it("offers the row edit and delete controls only with supplier:update and supplier:delete", async () => {
    const { unmount } = renderPage();
    await screen.findByText("NCC_0007");
    expect(screen.queryByTitle(viCommon.edit)).not.toBeInTheDocument();
    expect(screen.queryByTitle(viCommon.delete)).not.toBeInTheDocument();
    unmount();

    grant(
      SupplierPermission.read,
      SupplierPermission.update,
      SupplierPermission.delete,
    );
    renderPage();
    await screen.findByText("NCC_0007");
    expect(screen.getByTitle(viCommon.edit)).toBeInTheDocument();
    expect(screen.getByTitle(viCommon.delete)).toBeInTheDocument();
  });
});
