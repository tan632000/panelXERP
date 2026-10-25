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
import viEstimate from "@/kernel/langs/vi/estimate.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { RequestEstimateSection } from "@plugins/sales/estimate/components/RequestEstimateSection";
import { EstimatePermission } from "@plugins/sales/estimate/permissions/estimate-permission.keys";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const signedIn = vi.hoisted(() => ({
  user: { id: 21, role: "engineer" } as { id: number; role: string },
}));
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
    user: signedIn.user,
  }),
  useOptionalAuth: () => ({
    can,
    permissions: [...granted.value],
    user: signedIn.user,
  }),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/sales/requests/5",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const ESTIMATE = {
  id: 7,
  code: "DT_2027_0001",
  requestId: 5,
  status: "draft",
  latestRevision: 2,
  total: 5000000,
  request: null,
};

function renderSection(requestStatus: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, estimate: viEstimate, status: viStatus }}
      >
        <NotificationProvider>
          <RequestEstimateSection
            requestId={5}
            requestStatus={requestStatus}
            assignedEngineerId={21}
          />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function respondWith(rows: object[]) {
  apiGet.mockResolvedValue({
    data: { data: rows, meta: { page: 1, limit: 1, total: rows.length } },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set([EstimatePermission.read, EstimatePermission.create]);
  signedIn.user = { id: 21, role: "engineer" };
  respondWith([]);
});

afterEach(cleanup);

describe("RequestEstimateSection", () => {
  it("hides the start button from a holder of the permission who is neither the assigned engineer nor a lead", async () => {
    // An administrator holds every permission, yet the server refuses the write with 404.
    signedIn.user = { id: 1, role: "admin" };
    renderSection("assigned");

    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(screen.queryByText(viEstimate.create)).toBeNull();
  });

  it("shows the start button to an engineering lead who is not the assignee", async () => {
    signedIn.user = { id: 30, role: "engineeringLead" };
    renderSection("assigned");

    expect(await screen.findByText(viEstimate.create)).toBeTruthy();
  });

  it("starts the estimate of an assigned request and opens it", async () => {
    apiPost.mockResolvedValue({ data: { ...ESTIMATE, id: 9 } });
    renderSection("assigned");

    fireEvent.click(await screen.findByText(viEstimate.create));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/sales/estimates", { requestId: 5 });
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/sales/estimates/9"),
    );
    expect(apiGet).toHaveBeenCalledWith("/sales/estimates", {
      params: { requestId: 5, limit: 1 },
    });
  });

  it("offers no start on a request that is not assigned, nor without estimate:create", async () => {
    renderSection("estimating");
    await screen.findByText(viEstimate.noneYet);
    expect(screen.queryByText(viEstimate.create)).not.toBeInTheDocument();
    cleanup();

    granted.value = new Set([EstimatePermission.read]);
    renderSection("assigned");
    await screen.findByText(viEstimate.noneYet);
    expect(screen.queryByText(viEstimate.create)).not.toBeInTheDocument();
  });

  it("shows the code, revision and status of an existing estimate", async () => {
    respondWith([ESTIMATE]);
    renderSection("estimating");

    expect(await screen.findByText("DT_2027_0001")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.getByText(viEstimate.statuses.draft)).toBeInTheDocument();
    expect(screen.queryByText(viEstimate.create)).not.toBeInTheDocument();
  });

  it("renders nothing, and asks for nothing, without estimate:read", () => {
    granted.value = new Set();
    const { container } = renderSection("assigned");

    expect(container).toBeEmptyDOMElement();
    expect(apiGet).not.toHaveBeenCalled();
  });
});
