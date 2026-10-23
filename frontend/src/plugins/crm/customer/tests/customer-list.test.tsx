import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viContact from "@/kernel/langs/vi/contact.json";
import viCustomer from "@/kernel/langs/vi/customer.json";
import viModal from "@/kernel/langs/vi/modal.json";

import { CustomerListPage } from "@plugins/crm/customer/components/CustomerListPage";
import { CustomerPermission } from "@plugins/crm/customer/permissions/customer-permission.keys";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);
const searchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({
    can,
    permissions: [...granted.value],
    user: { id: 11, role: "sales" },
    logout: vi.fn(),
  }),
  useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.value,
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/crm/customers",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const CUSTOMER = {
  id: 7,
  code: "KH_0007",
  name: "Alpha Panels",
  taxCode: "0101234567",
  address: null,
  phone: "0901234567",
  email: "contact@alpha.vn",
  salesOwnerId: 11,
  salesOwnerName: "Demo Sales A",
  note: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function respond() {
  apiGet.mockImplementation((url: string) => {
    if (url === "/customers") {
      return Promise.resolve({
        data: {
          data: [CUSTOMER],
          meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
        },
      });
    }
    if (url === "/customers/next-code") {
      return Promise.resolve({ data: { code: "KH_0008" } });
    }
    if (url === "/customers/owner-options") {
      return Promise.resolve({ data: [{ id: 11, fullName: "Demo Sales A" }] });
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
          customer: viCustomer,
          contact: viContact,
          modal: viModal,
        }}
      >
        <NotificationProvider>
          <CustomerListPage />
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
  grant(CustomerPermission.read);
  respond();
});

afterEach(cleanup);

describe("CustomerListPage", () => {
  it("lists the customers the API returns, with their owner", async () => {
    renderPage();

    expect(await screen.findByText("KH_0007")).toBeInTheDocument();
    expect(screen.getByText("Alpha Panels")).toBeInTheDocument();
    expect(screen.getByText("Demo Sales A")).toBeInTheDocument();
  });

  it("hides the create button from an actor without customer:create", async () => {
    grant(CustomerPermission.read);
    renderPage();
    await screen.findByText("KH_0007");

    expect(screen.queryByText(viCustomer.addButton)).not.toBeInTheDocument();
  });

  it("shows the create button to an actor holding customer:create", async () => {
    grant(CustomerPermission.read, CustomerPermission.create);
    renderPage();
    await screen.findByText("KH_0007");

    expect(screen.getByText(viCustomer.addButton)).toBeInTheDocument();
  });

  it("offers the row edit and delete controls only with customer:update and customer:delete", async () => {
    grant(CustomerPermission.read);
    const { unmount } = renderPage();
    await screen.findByText("KH_0007");
    expect(screen.queryByTitle(viCommon.edit)).not.toBeInTheDocument();
    expect(screen.queryByTitle(viCommon.delete)).not.toBeInTheDocument();
    unmount();

    grant(
      CustomerPermission.read,
      CustomerPermission.update,
      CustomerPermission.delete,
    );
    renderPage();
    await screen.findByText("KH_0007");
    expect(screen.getByTitle(viCommon.edit)).toBeInTheDocument();
    expect(screen.getByTitle(viCommon.delete)).toBeInTheDocument();
  });

  it("never asks for the next code or the owners while the create modal is closed", async () => {
    grant(CustomerPermission.read, CustomerPermission.create);
    renderPage();
    await screen.findByText("KH_0007");

    const urls = apiGet.mock.calls.map((call) => call[0] as string);
    expect(urls).not.toContain("/customers/next-code");
  });
});
