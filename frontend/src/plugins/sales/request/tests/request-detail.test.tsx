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
import viRequest from "@/kernel/langs/vi/request.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { RequestDetailPage } from "@plugins/sales/request/components/RequestDetailPage";
import { RequestPermission } from "@plugins/sales/request/permissions/request-permission.keys";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);

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
  useParams: () => ({ id: "5" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/sales/requests/5",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const DETAIL = {
  id: 5,
  code: "YC_2027_0001",
  title: "Panel line control cabinet",
  status: "draft",
  customerId: 3,
  salesOwnerId: 11,
  salesOwnerName: "Sales A",
  assignedEngineerId: null,
  assignedEngineerName: null,
  quotationDueDate: null,
  requestedDeliveryDate: null,
  technicalRequirements: "PIR 50mm",
  customer: {
    id: 3,
    code: "KH_0001",
    name: "Alpha Panels",
    taxCode: "0101234567",
    address: "1 Demo Street",
  },
  project: {
    id: 8,
    code: "DA_0001",
    name: "Tower A",
    siteAddress: "1 Site Road",
  },
  contact: {
    id: 9,
    name: "Lan Nguyen",
    position: "Buyer",
    phone: "0900000001",
    email: "lan@example.com",
  },
};

function respond(detail: object = DETAIL) {
  apiGet.mockImplementation((url: string) => {
    if (url === "/sales/requests/5") return Promise.resolve({ data: detail });
    if (url === "/sales/requests/5/activities") {
      return Promise.resolve({ data: [] });
    }
    if (url === "/sales/requests/5/attachments") {
      return Promise.resolve({ data: [] });
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
          <RequestDetailPage />
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
  grant(RequestPermission.read);
  respond();
});

afterEach(cleanup);

describe("RequestDetailPage", () => {
  it("shows the embedded customer, project and contact summaries", async () => {
    renderPage();

    expect(await screen.findByText("KH_0001")).toBeInTheDocument();
    expect(screen.getByText("Alpha Panels")).toBeInTheDocument();
    expect(screen.getByText("0101234567")).toBeInTheDocument();
    expect(screen.getByText("DA_0001")).toBeInTheDocument();
    expect(screen.getByText("1 Site Road")).toBeInTheDocument();
    expect(screen.getByText("Lan Nguyen")).toBeInTheDocument();
    expect(screen.getByText("0900000001")).toBeInTheDocument();
  });

  it("offers no action to a reader holding only request:read", async () => {
    renderPage();
    await screen.findByText("KH_0001");

    expect(screen.queryByText(viRequest.assign)).not.toBeInTheDocument();
    expect(screen.queryByText(viRequest.cancelRequest)).not.toBeInTheDocument();
    expect(screen.queryByText(viRequest.markLost)).not.toBeInTheDocument();
    expect(screen.queryByTitle(viRequest.edit)).not.toBeInTheDocument();
  });

  it("does not offer to mark a draft lost, nor to cancel a quoted request", async () => {
    grant(RequestPermission.read, RequestPermission.cancel);
    renderPage();
    await screen.findByText("KH_0001");
    expect(screen.getByText(viRequest.cancelRequest)).toBeInTheDocument();
    expect(screen.queryByText(viRequest.markLost)).not.toBeInTheDocument();
    cleanup();

    respond({ ...DETAIL, status: "quoted" });
    renderPage();
    await screen.findByText("KH_0001");
    expect(screen.getByText(viRequest.markLost)).toBeInTheDocument();
    expect(screen.queryByText(viRequest.cancelRequest)).not.toBeInTheDocument();
  });

  it("requires a reason before a request can be cancelled, then sends it trimmed", async () => {
    grant(RequestPermission.read, RequestPermission.cancel);
    apiPost.mockResolvedValue({ data: { ...DETAIL, status: "cancelled" } });
    renderPage();
    await screen.findByText("KH_0001");

    fireEvent.click(screen.getByText(viRequest.cancelRequest));
    const submit = await screen.findByRole("button", {
      name: viRequest.cancelSubmit,
    });
    expect(submit).toBeDisabled();

    const reason = screen.getByPlaceholderText(viRequest.reason.placeholder);
    fireEvent.change(reason, { target: { value: "   " } });
    expect(
      screen.getByRole("button", { name: viRequest.cancelSubmit }),
    ).toBeDisabled();
    expect(apiPost).not.toHaveBeenCalled();

    fireEvent.change(reason, { target: { value: "  Customer withdrew  " } });
    fireEvent.click(
      screen.getByRole("button", { name: viRequest.cancelSubmit }),
    );

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/sales/requests/5/cancel", {
      reason: "Customer withdrew",
    });
  });
});
