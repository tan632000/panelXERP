import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import viCommon from "@/kernel/langs/vi/common.json";
import viEstimate from "@/kernel/langs/vi/estimate.json";
import viModal from "@/kernel/langs/vi/modal.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { ItemPermission } from "@plugins/catalog/item/permissions/item-permission.keys";
import { EstimateDetailPage } from "@plugins/sales/estimate/components/EstimateDetailPage";
import { EstimatePermission } from "@plugins/sales/estimate/permissions/estimate-permission.keys";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const apiPatch = vi.hoisted(() => vi.fn());
const apiDelete = vi.hoisted(() => vi.fn());
const showError = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const actorUser = vi.hoisted(() => ({
  value: { id: 11, role: "sales" } as { id: number; role: string },
}));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);

vi.mock("@/kernel/core/api/api", () => ({
  default: {
    get: apiGet,
    post: apiPost,
    patch: apiPatch,
    delete: apiDelete,
  },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({
    can,
    permissions: [...granted.value],
    user: actorUser.value,
    logout: vi.fn(),
  }),
  useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
}));

// The toast host is not mounted in a page test, so the notifier is observed directly.
vi.mock("@/kernel/core/contexts/NotificationContext", () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError,
    showInfo: vi.fn(),
    showWarning: vi.fn(),
  }),
  NotificationProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "7" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/sales/estimates/7",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

interface DetailOptions {
  status?: "draft" | "submitted" | "superseded";
  pricedAt?: string | null;
  requestStatus?: string;
  latestRevision?: number;
  revision?: number;
}

function bomLine(id: number, itemCode: string, unitCost: number) {
  return {
    id,
    itemId: id + 100,
    itemCode,
    itemName: itemCode,
    itemBrand: null,
    itemUnit: "Cái",
    quantity: 2,
    unitCost,
    amount: unitCost * 2,
    note: null,
  };
}

function detail(options: DetailOptions = {}) {
  const {
    status = "submitted",
    pricedAt = null,
    requestStatus = "estimated",
    latestRevision = 1,
    revision = 1,
  } = options;
  return {
    id: 7,
    code: "DT_2027_0001",
    requestId: 5,
    status: status === "draft" ? "draft" : "submitted",
    latestRevision,
    total: 1000000,
    request: {
      id: 5,
      code: "YC_2027_0001",
      title: "Panel line control cabinet",
      status: requestStatus,
      customerName: "Alpha Panels",
      salesOwnerId: 11,
      salesOwnerName: "Sales A",
      assignedEngineerId: 30,
      assignedEngineerName: "Engineer A",
    },
    revisions: Array.from({ length: latestRevision }, (_, index) => ({
      revision: index + 1,
      status: index + 1 === latestRevision ? "submitted" : "superseded",
      total: 1000000,
    })),
    current: {
      id: 70 + revision,
      estimateId: 7,
      revision,
      status,
      total: 1000000,
      submittedAt: status === "draft" ? null : "2027-01-05T03:00:00.000Z",
      pricedAt,
      panels: [
        {
          id: 1,
          tag: "MSB-01",
          description: null,
          quantity: 1,
          unitCost: 1000000,
          total: 1000000,
          bomLines: [bomLine(11, "CB-3X4", 24500), bomLine(12, "GLAND", 0)],
          costLines: [
            { id: 21, category: "design", description: null, amount: 500000 },
          ],
        },
      ],
    },
  };
}

function respond(body: object) {
  apiGet.mockImplementation((url: string) =>
    url === "/sales/estimates/7"
      ? Promise.resolve({ data: body })
      : Promise.resolve({ data: null }),
  );
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
          estimate: viEstimate,
          modal: viModal,
          status: viStatus,
        }}
      >
        <EstimateDetailPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const SALES = [
  EstimatePermission.read,
  EstimatePermission.price,
  ItemPermission.referencePriceRead,
];
const ENGINEER = [
  EstimatePermission.read,
  EstimatePermission.update,
  EstimatePermission.submit,
  EstimatePermission.create,
];

function grant(...permissions: string[]) {
  granted.value = new Set(permissions);
}

/** Waits for the page body, whichever status it ends up showing. */
const loaded = () => screen.findByText(viEstimate.infoBasic);

beforeEach(() => {
  vi.clearAllMocks();
  actorUser.value = { id: 11, role: "sales" };
  grant(...SALES);
  respond(detail());
});

afterEach(cleanup);

describe("pricing a submitted estimate", () => {
  it("shows the unit cost inputs, the cost lines and the complete action", async () => {
    renderPage();

    await screen.findByLabelText("Đơn giá CB-3X4");

    expect(screen.getByLabelText("Đơn giá GLAND")).toBeInTheDocument();
    expect(screen.getByLabelText("Số tiền Thiết kế")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: viEstimate.pricing.complete }),
    ).toBeInTheDocument();
    expect(screen.getByText(viEstimate.pricing.awaiting)).toBeInTheDocument();
  });

  it("sends a typed unit cost to the pricing route, never to the draft BOM route", async () => {
    apiPatch.mockResolvedValue({ data: detail().current });
    renderPage();

    const input = await screen.findByLabelText("Đơn giá GLAND");
    fireEvent.change(input, { target: { value: "15000" } });
    expect(apiPatch).not.toHaveBeenCalled();
    fireEvent.blur(input);

    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    expect(apiPatch).toHaveBeenCalledWith(
      "/sales/estimates/7/bom-lines/12/unit-cost",
      { unitCost: 15000 },
    );
  });

  it("takes whole VND only for a cost line", async () => {
    apiPatch.mockResolvedValue({ data: detail().current });
    renderPage();

    const amount = await screen.findByLabelText("Số tiền Thiết kế");
    fireEvent.change(amount, { target: { value: "1000,5" } });
    fireEvent.blur(amount);

    // The mask drops the decimals, so what is saved is a whole number; it must be saved.
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    const [url, body] = apiPatch.mock.calls[0] as [string, { amount: number }];
    expect(url).toBe("/sales/estimates/7/cost-lines/21");
    expect(Number.isInteger(body.amount)).toBe(true);
  });

  it("adds a cost line through the cost-line route of the panel", async () => {
    apiPost.mockResolvedValue({ data: detail().current });
    renderPage();

    fireEvent.click(await screen.findByText(viEstimate.cost.add));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith(
      "/sales/estimates/7/panels/1/cost-lines",
      { category: "labor", amount: 0 },
    );
  });

  it("completes the pricing only after the confirmation", async () => {
    apiPost.mockResolvedValue({ data: detail().current });
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: viEstimate.pricing.complete }),
    );
    expect(apiPost).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: viEstimate.pricing.complete }),
    );

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost.mock.calls[0][0]).toBe("/sales/estimates/7/price");
  });

  it("names the items without a cost when the server refuses to complete", async () => {
    apiPost.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          message:
            "Every BOM line needs a unit cost before the estimate is priced; no cost for: GLAND, RELAY.",
        },
      },
    });
    renderPage();

    fireEvent.click(
      await screen.findByRole("button", { name: viEstimate.pricing.complete }),
    );
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: viEstimate.pricing.complete,
      }),
    );

    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
    expect(showError).toHaveBeenCalledWith(
      viEstimate.toast.zeroCost.replace("{codes}", "GLAND, RELAY"),
    );
  });
});

describe("an estimate that is not being priced", () => {
  const noPricingControls = () => {
    expect(screen.queryByLabelText("Đơn giá CB-3X4")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Số tiền Thiết kế")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: viEstimate.pricing.complete }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(viEstimate.cost.add)).not.toBeInTheDocument();
  };

  it("shows a priced revision without inputs, marked as priced", async () => {
    respond(detail({ pricedAt: "2027-01-06T03:00:00.000Z" }));
    renderPage();

    await screen.findByText(viEstimate.pricing.priced);
    noPricingControls();
  });

  it("shows an engineer the awaiting status and no price input", async () => {
    grant(...ENGINEER);
    actorUser.value = { id: 30, role: "engineer" };
    renderPage();

    await screen.findByText(viEstimate.pricing.awaiting);
    noPricingControls();
  });

  it("offers no pricing on a draft, and no status either", async () => {
    respond(detail({ status: "draft" }));
    renderPage();

    await loaded();
    noPricingControls();
    expect(screen.queryByText(viEstimate.pricing.awaiting)).toBeNull();
    expect(screen.queryByText(viEstimate.pricing.priced)).toBeNull();
  });

  it("never sends a unit cost from a draft: no input, and a BOM save carries the quantity only", async () => {
    grant(...ENGINEER, ItemPermission.referencePriceRead);
    actorUser.value = { id: 30, role: "engineer" };
    respond(detail({ status: "draft", requestStatus: "estimating" }));
    apiPatch.mockResolvedValue({ data: detail({ status: "draft" }).current });
    renderPage();

    const quantity = await screen.findByLabelText("Số lượng CB-3X4");
    expect(screen.queryByLabelText("Đơn giá CB-3X4")).not.toBeInTheDocument();
    fireEvent.change(quantity, { target: { value: "5" } });
    fireEvent.blur(quantity);

    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    expect(apiPatch).toHaveBeenCalledWith("/sales/estimates/7/bom-lines/11", {
      quantity: 5,
    });
  });

  it("offers no pricing once the request has moved on from estimated", async () => {
    respond(detail({ requestStatus: "quoted" }));
    renderPage();

    await screen.findByText(viEstimate.pricing.awaiting);
    noPricingControls();
  });

  it("offers no pricing on an older revision", async () => {
    respond(detail({ latestRevision: 2, revision: 1 }));
    renderPage();

    await loaded();
    noPricingControls();
  });
});
