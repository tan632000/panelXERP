import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viModal from "@/kernel/langs/vi/modal.json";
import viRequest from "@/kernel/langs/vi/request.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { RequestListPage } from "@plugins/sales/request/components/RequestListPage";
import { RequestPermission } from "@plugins/sales/request/permissions/request-permission.keys";

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
  usePathname: () => "/sales/requests",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const REQUEST = {
  id: 5,
  code: "YC_2027_0001",
  title: "Panel line control cabinet",
  status: "assigned",
  customerId: 3,
  customerCode: "KH_0001",
  customerName: "Alpha Panels",
  salesOwnerId: 11,
  salesOwnerName: "Sales A",
  assignedEngineerId: 30,
  assignedEngineerName: "Engineer A",
  quotationDueDate: "2027-01-20",
  requestedDeliveryDate: null,
  createdAt: "2026-10-01T00:00:00.000Z",
};

function respond() {
  apiGet.mockImplementation((url: string) => {
    if (url === "/sales/requests") {
      return Promise.resolve({
        data: {
          data: [REQUEST],
          meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
        },
      });
    }
    if (url === "/sales/requests/engineer-options") {
      return Promise.resolve({ data: [{ id: 30, fullName: "Engineer A" }] });
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
          request: viRequest,
          modal: viModal,
          status: viStatus,
        }}
      >
        <NotificationProvider>
          <RequestListPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function grant(...permissions: string[]) {
  granted.value = new Set(permissions);
}

const listCalls = () =>
  apiGet.mock.calls.filter(([url]) => url === "/sales/requests");

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  searchParams.value = new URLSearchParams();
  grant(RequestPermission.read);
  respond();
});

afterEach(cleanup);

describe("RequestListPage", () => {
  it("lists the requests the API returns, with the status label, customer and due date", async () => {
    renderPage();

    expect(await screen.findByText("YC_2027_0001")).toBeInTheDocument();
    expect(screen.getByText("Panel line control cabinet")).toBeInTheDocument();
    expect(screen.getByText("KH_0001 — Alpha Panels")).toBeInTheDocument();
    expect(screen.getByText(viRequest.statuses.assigned)).toBeInTheDocument();
    expect(screen.getByText("Engineer A")).toBeInTheDocument();
    expect(screen.getByText("20/01/2027")).toBeInTheDocument();
  });

  it("hides the create button from a reader holding only request:read", async () => {
    renderPage();
    await screen.findByText("YC_2027_0001");

    expect(screen.queryByText(viRequest.addButton)).not.toBeInTheDocument();
  });

  it("shows the create button only with request:create", async () => {
    grant(RequestPermission.read, RequestPermission.create);
    renderPage();
    await screen.findByText("YC_2027_0001");

    expect(screen.getByText(viRequest.addButton)).toBeInTheDocument();
  });

  it("offers the engineer filter, and loads its options, only with request:assign", async () => {
    const { unmount } = renderPage();
    await screen.findByText("YC_2027_0001");
    expect(screen.queryByText(viRequest.filters.engineer)).toBeNull();
    expect(apiGet).not.toHaveBeenCalledWith(
      "/sales/requests/engineer-options",
      expect.anything(),
    );
    expect(apiGet.mock.calls.map(([url]) => url)).not.toContain(
      "/sales/requests/engineer-options",
    );
    unmount();

    grant(RequestPermission.read, RequestPermission.assign);
    renderPage();
    await screen.findByText("YC_2027_0001");
    expect(
      await screen.findByText(viRequest.filters.engineer),
    ).toBeInTheDocument();
    expect(apiGet.mock.calls.map(([url]) => url)).toContain(
      "/sales/requests/engineer-options",
    );
  });

  it("asks the list endpoint without filters at first", async () => {
    renderPage();
    await screen.findByText("YC_2027_0001");

    const [, config] = listCalls()[0] as [
      string,
      { params: Record<string, unknown> },
    ];
    expect(config.params.page).toBe(1);
    expect(config.params.status).toBeUndefined();
    expect(config.params.assignedEngineerId).toBeUndefined();
    expect(config.params.quotationDueFrom).toBeUndefined();
    expect(config.params.quotationDueTo).toBeUndefined();
  });
});
