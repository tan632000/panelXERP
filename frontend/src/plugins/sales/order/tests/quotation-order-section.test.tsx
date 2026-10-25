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
import viOrder from "@/kernel/langs/vi/order.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { QuotationOrderSection } from "@plugins/sales/order/components/QuotationOrderSection";
import { OrderPermission } from "@plugins/sales/order/permissions/order.permissions";

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
  usePathname: () => "/sales/quotations/9",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const ORDER = {
  id: 4,
  code: "DH_2026_0001",
  status: "open",
  quotationId: 9,
  total: 3363511,
  request: { id: 5, code: "YC_2026_0001" },
};

function respondWith(orders: object[]) {
  apiGet.mockResolvedValue({
    data: { data: orders, meta: { total: orders.length } },
  });
}

function renderSection(versionStatus: string, isLatest = true) {
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
          modal: viModal,
          order: viOrder,
          status: viStatus,
        }}
      >
        <NotificationProvider>
          <QuotationOrderSection
            quotationId={9}
            versionStatus={versionStatus}
            isLatest={isLatest}
          />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const convertLabel = viOrder.fromQuotation.convert;

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set([OrderPermission.read, OrderPermission.create]);
});

afterEach(cleanup);

describe("QuotationOrderSection", () => {
  it("renders nothing and asks for nothing without order:read", () => {
    granted.value = new Set();

    const { container } = renderSection("customer_confirmed");

    expect(container).toBeEmptyDOMElement();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("shows nothing while the version is not customer-confirmed and no order exists", async () => {
    respondWith([]);

    const { container } = renderSection("approved");

    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("asks for the order of this quotation only", async () => {
    respondWith([]);
    renderSection("customer_confirmed");

    await screen.findByText(viOrder.fromQuotation.none);

    expect(apiGet).toHaveBeenCalledWith("/sales/orders", {
      params: { quotationId: 9, limit: 1 },
    });
  });

  it("converts a confirmed version with the optional contract fields and opens the order", async () => {
    respondWith([]);
    apiPost.mockResolvedValue({ data: { ...ORDER } });
    renderSection("customer_confirmed");

    fireEvent.click(await screen.findByRole("button", { name: convertLabel }));
    fireEvent.change(screen.getByLabelText(viOrder.contractNo), {
      target: { value: " HD-01 " },
    });
    fireEvent.click(screen.getAllByRole("button", { name: convertLabel })[1]);

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/sales/orders", {
        quotationId: 9,
        contractNo: "HD-01",
        contractDate: null,
        deliveryDate: null,
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/sales/orders/4"));
  });

  it("offers no conversion without order:create", async () => {
    granted.value = new Set([OrderPermission.read]);
    respondWith([]);
    renderSection("customer_confirmed");

    await screen.findByText(viOrder.fromQuotation.none);

    expect(screen.queryByRole("button", { name: convertLabel })).toBeNull();
  });

  it("shows the order it already has, with its status, and offers no second conversion", async () => {
    respondWith([ORDER]);
    renderSection("customer_confirmed");

    expect(await screen.findByText("DH_2026_0001")).toBeInTheDocument();
    expect(screen.getByText(viOrder.statuses.open)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: convertLabel })).toBeNull();
  });

  it("shows nothing for an older version pinned for reading", () => {
    const { container } = renderSection("customer_confirmed", false);

    expect(container).toBeEmptyDOMElement();
    expect(apiGet).not.toHaveBeenCalled();
  });
});
