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
import viQuotation from "@/kernel/langs/vi/quotation.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { RequestQuotationSection } from "@plugins/sales/quotation/components/RequestQuotationSection";
import { QuotationPermission } from "@plugins/sales/quotation/permissions/quotation-permission.keys";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({ can, permissions: [...granted.value] }),
  useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/sales/requests/5",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const QUOTATION = {
  id: 9,
  code: "03-08092026/BG",
  requestId: 5,
  estimateId: 7,
  latestVer: 2,
  request: null,
  latest: { ver: 2, status: "draft", total: 3363511 },
};

function respondWith(quotations: object[]) {
  apiGet.mockResolvedValue({
    data: { data: quotations, meta: { total: quotations.length } },
  });
}

function renderSection(requestStatus: string) {
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
          quotation: viQuotation,
          status: viStatus,
        }}
      >
        <NotificationProvider>
          <RequestQuotationSection
            requestId={5}
            requestStatus={requestStatus}
          />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set([
    QuotationPermission.read,
    QuotationPermission.create,
  ]);
});

afterEach(cleanup);

describe("RequestQuotationSection", () => {
  it("renders nothing and asks for nothing without quotation:read", () => {
    granted.value = new Set();

    const { container } = renderSection("estimated");

    expect(container).toBeEmptyDOMElement();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("offers the create button on an estimated request with no quotation, and opens the new one", async () => {
    respondWith([]);
    apiPost.mockResolvedValue({ data: { ...QUOTATION } });
    renderSection("estimated");

    fireEvent.click(await screen.findByRole("button", { name: "Tạo báo giá" }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/sales/quotations", {
        requestId: 5,
      }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/sales/quotations/9"),
    );
  });

  it("hides the button without quotation:create", async () => {
    granted.value = new Set([QuotationPermission.read]);
    respondWith([]);
    renderSection("estimated");

    await screen.findByText("Yêu cầu này chưa có báo giá.");

    expect(screen.queryByRole("button", { name: "Tạo báo giá" })).toBeNull();
  });

  it("shows nothing on a request that is not estimated and has no quotation", async () => {
    respondWith([]);

    const { container } = renderSection("estimating");

    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows the quotation of an estimated request with its version, status and total", async () => {
    respondWith([QUOTATION]);
    renderSection("estimated");

    expect(await screen.findByText("03-08092026/BG")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("Nháp")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tạo báo giá" })).toBeNull();
  });
});
