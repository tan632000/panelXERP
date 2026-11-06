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

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
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
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const actorUser = vi.hoisted(() => ({
  value: { id: 30, role: "engineer" } as { id: number; role: string },
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

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "7" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/sales/estimates/7",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

/** The two-panel fixture of the totals specs: 12.573.708 VND in all. */
function panels(overrides: { emptyB?: boolean } = {}) {
  return [
    {
      id: 1,
      tag: "MSB-01",
      description: "Main board",
      quantity: 2,
      unitCost: 5756353,
      total: 11512706,
      bomLines: [
        line(11, "CB-3X4", "Cable 3x4", 12.5, 24500, 306250),
        line(12, "MCCB-3P", "MCCB 3P", 3, 1250000.5, 3750002),
        line(13, "GLAND", "Gland", 1.005, 100, 101),
      ],
      costLines: [
        { id: 21, category: "design", description: null, amount: 500000 },
        { id: 22, category: "labor", description: null, amount: 1200000 },
      ],
    },
    {
      id: 2,
      tag: "MSB-02",
      description: null,
      quantity: 1,
      unitCost: 1061002,
      total: 1061002,
      bomLines: overrides.emptyB
        ? []
        : [
            line(14, "BUSBAR", "Busbar", 7.25, 80000, 580000),
            line(15, "RELAY", "Relay", 2, 15500.75, 31002),
          ],
      costLines: [
        { id: 23, category: "installation", description: null, amount: 300000 },
        { id: 24, category: "transport", description: null, amount: 150000 },
      ],
    },
  ];
}

function line(
  id: number,
  itemCode: string,
  itemName: string,
  quantity: number,
  unitCost: number,
  amount: number,
) {
  return {
    id,
    itemId: id + 100,
    itemCode,
    itemName,
    itemBrand: "Schneider",
    itemUnit: "Cái",
    quantity,
    unitCost,
    amount,
    note: null,
  };
}

interface DetailOptions {
  status?: "draft" | "submitted" | "superseded";
  latestRevision?: number;
  revision?: number;
  requestStatus?: string;
  emptyB?: boolean;
}

function detail(options: DetailOptions = {}) {
  const {
    status = "draft",
    latestRevision = 1,
    revision = 1,
    requestStatus = "estimating",
    emptyB = false,
  } = options;
  // The header and the latest revision list say `submitted` even while an older one is shown.
  const headerStatus = status === "superseded" ? "submitted" : status;
  return {
    id: 7,
    code: "DT_2027_0001",
    requestId: 5,
    status: headerStatus,
    latestRevision,
    total: 12573708,
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
      status: index + 1 === latestRevision ? headerStatus : "superseded",
      total: 12573708,
    })),
    current: {
      id: 70 + revision,
      estimateId: 7,
      revision,
      status,
      total: 12573708,
      submittedAt: status === "draft" ? null : "2027-01-05T03:00:00.000Z",
      panels: panels({ emptyB }),
    },
  };
}

/** What the server sends an actor without `reference_price:read`: the money keys are absent. */
function withoutMoney(body: ReturnType<typeof detail>) {
  const { total: _total, ...header } = body;
  const { total: _revisionTotal, ...current } = body.current;
  return {
    ...header,
    revisions: body.revisions.map(({ total: _t, ...entry }) => entry),
    current: {
      ...current,
      panels: body.current.panels.map(
        ({ unitCost: _u, total: _pt, costLines: _c, ...panel }) => ({
          ...panel,
          bomLines: panel.bomLines.map(
            ({ unitCost: _bu, amount: _a, ...bom }) => bom,
          ),
        }),
      ),
    },
  };
}

function respond(body: object) {
  apiGet.mockImplementation((url: string) => {
    if (url === "/sales/estimates/7") return Promise.resolve({ data: body });
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
          estimate: viEstimate,
          modal: viModal,
          status: viStatus,
        }}
      >
        <NotificationProvider>
          <EstimateDetailPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function grant(...permissions: string[]) {
  granted.value = new Set(permissions);
}

/** `12.573.708 ₫` with its no-break space, reduced to the digits and separators. */
const amountOf = (testId: string) =>
  (screen.getByTestId(testId).textContent ?? "").replace(/[^\d.]/g, "");

const ENGINEER = [
  EstimatePermission.read,
  EstimatePermission.update,
  EstimatePermission.submit,
  EstimatePermission.create,
];

/** Reads prices, so the figures render; the default actor is the director, who writes any draft. */
const PRICE_READER = [...ENGINEER, ItemPermission.referencePriceRead];

beforeEach(() => {
  vi.clearAllMocks();
  actorUser.value = { id: 50, role: "director" };
  grant(...PRICE_READER);
  respond(detail());
});

afterEach(cleanup);

describe("estimate editor totals", () => {
  it("shows the totals the server stored for the fixture", async () => {
    renderPage();

    await screen.findByTestId("revision-total");

    expect(amountOf("revision-total")).toBe("12.573.708");
    expect(amountOf("panel-unit-cost")).toBe("5.756.353");
    expect(amountOf("panel-total")).toBe("11.512.706");
    expect(screen.getByTestId("bom-amount-12")).toHaveTextContent("3.750.002");
  });

  it("follows a quantity as it is typed, and saves it when the cell loses focus", async () => {
    apiPatch.mockResolvedValue({
      data: {
        ...detail().current,
        total: 12451208,
        panels: panels().map((panel) => ({
          ...panel,
          ...(panel.id === 1
            ? { unitCost: 5695103, total: 11390206 }
            : undefined),
        })),
      },
    });
    renderPage();
    await screen.findByTestId("revision-total");

    const quantity = screen.getByLabelText("Số lượng CB-3X4");
    fireEvent.change(quantity, { target: { value: "10" } });

    // 10 × 24.500 = 245.000 instead of 306.250: the panel (×2) and the estimate move at once.
    expect(screen.getByTestId("bom-amount-11")).toHaveTextContent("245.000");
    expect(amountOf("panel-total")).toBe("11.390.206");
    expect(amountOf("revision-total")).toBe("12.451.208");
    expect(apiPatch).not.toHaveBeenCalled();

    fireEvent.blur(quantity);

    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    expect(apiPatch).toHaveBeenCalledWith("/sales/estimates/7/bom-lines/11", {
      quantity: 10,
    });
  });

  it("does not send an entry the server would refuse, and puts the saved value back", async () => {
    renderPage();
    await screen.findByTestId("revision-total");

    const quantity = screen.getByLabelText("Số lượng CB-3X4");
    fireEvent.change(quantity, { target: { value: "0" } });
    fireEvent.blur(quantity);

    await waitFor(() =>
      expect(screen.getByTestId("bom-amount-11")).toHaveTextContent("306.250"),
    );
    expect(apiPatch).not.toHaveBeenCalled();
  });
});

describe("deleting lines", () => {
  it("asks before removing a BOM line, then removes exactly that line", async () => {
    apiDelete.mockResolvedValue({ data: detail().current });
    renderPage();
    await screen.findByTestId("revision-total");

    fireEvent.click(screen.getByLabelText("Xoá dòng CB-3X4"));
    expect(apiDelete).not.toHaveBeenCalled();
    await screen.findByText("Xoá dòng vật tư CB-3X4 khỏi tủ?");

    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: viCommon.delete,
      }),
    );

    await waitFor(() => expect(apiDelete).toHaveBeenCalledTimes(1));
    expect(apiDelete).toHaveBeenCalledWith("/sales/estimates/7/bom-lines/11");
  });

  it("leaves the line alone when the removal is cancelled", async () => {
    renderPage();
    await screen.findByTestId("revision-total");

    fireEvent.click(screen.getByLabelText("Xoá dòng CB-3X4"));
    fireEvent.click(
      await screen.findByRole("button", { name: viCommon.cancel }),
    );

    expect(apiDelete).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Số lượng CB-3X4")).toBeInTheDocument();
  });
});

describe("submit gating", () => {
  it("offers no submit button without estimate:submit", async () => {
    grant(
      EstimatePermission.read,
      EstimatePermission.update,
      ItemPermission.referencePriceRead,
    );
    renderPage();
    await screen.findByTestId("revision-total");

    expect(
      screen.queryByRole("button", { name: viEstimate.submit }),
    ).not.toBeInTheDocument();
  });

  it("disables submit while a panel has no BOM line", async () => {
    respond(detail({ emptyB: true }));
    renderPage();
    await screen.findByTestId("revision-total");

    const submit = screen.getByRole("button", { name: viEstimate.submit });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(
      screen.queryByText(`Gửi dự toán DT_2027_0001`),
    ).not.toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("disables submit while an entry is typed and not saved", async () => {
    renderPage();
    await screen.findByTestId("revision-total");
    const submit = screen.getByRole("button", { name: viEstimate.submit });
    expect(submit).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Số lượng CB-3X4"), {
      target: { value: "11" },
    });

    expect(
      screen.getByRole("button", { name: viEstimate.submit }),
    ).toBeDisabled();
  });

  it("asks for confirmation, then submits the estimate once", async () => {
    apiPost.mockResolvedValue({ data: detail({ status: "submitted" }) });
    renderPage();
    await screen.findByTestId("revision-total");

    fireEvent.click(screen.getByRole("button", { name: viEstimate.submit }));
    await screen.findByText("Gửi dự toán DT_2027_0001");
    expect(apiPost).not.toHaveBeenCalled();

    // The dialog's own confirm button carries the same label; it is the last one drawn.
    const buttons = screen.getAllByRole("button", { name: viEstimate.submit });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/sales/estimates/7/submit");
  });
});

describe("who may write", () => {
  it("lets the director edit and submit a draft", async () => {
    actorUser.value = { id: 50, role: "director" };
    renderPage();
    await screen.findByTestId("revision-total");

    expect(screen.getByLabelText("Số lượng CB-3X4")).toBeInTheDocument();
    expect(screen.getByText(viEstimate.panel.add)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: viEstimate.submit }),
    ).toBeEnabled();
  });

  it("shows a draft read-only to an administrator holding every estimate permission", async () => {
    actorUser.value = { id: 1, role: "admin" };
    renderPage();
    await screen.findByTestId("revision-total");

    expect(screen.queryByLabelText("Số lượng CB-3X4")).not.toBeInTheDocument();
    expect(screen.queryByText(viEstimate.panel.add)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: viEstimate.submit }),
    ).not.toBeInTheDocument();
  });

  it("gives a draft row no unit cost input, only the stored figure", async () => {
    renderPage();
    await screen.findByTestId("revision-total");

    expect(screen.getByLabelText("Số lượng CB-3X4")).toBeInTheDocument();
    expect(screen.queryByLabelText("Đơn giá CB-3X4")).not.toBeInTheDocument();
    expect(screen.getByText("24.500")).toBeInTheDocument();
  });

  it("lets the engineering lead edit and submit someone else's draft", async () => {
    actorUser.value = { id: 99, role: "engineeringLead" };
    renderPage();
    await screen.findByTestId("revision-total");

    expect(screen.getByLabelText("Số lượng CB-3X4")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: viEstimate.submit }),
    ).toBeEnabled();
  });

  it("shows an engineer who is not the assigned one a read-only draft", async () => {
    actorUser.value = { id: 31, role: "engineer" };
    renderPage();
    await screen.findByTestId("revision-total");

    expect(screen.queryByLabelText("Số lượng CB-3X4")).not.toBeInTheDocument();
  });

  it("stops editing once the request is quoted or closed", async () => {
    respond(detail({ requestStatus: "quoted" }));
    renderPage();
    await screen.findByTestId("revision-total");

    expect(screen.queryByLabelText("Số lượng CB-3X4")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: viEstimate.submit }),
    ).not.toBeInTheDocument();
  });

  it("shows a draft's cost lines to the director without an edit control", async () => {
    renderPage();
    await screen.findByTestId("revision-total");

    expect(screen.getByText(viEstimate.cost.title)).toBeInTheDocument();
    expect(screen.getAllByText("Nhân công").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Số tiền Nhân công")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: viEstimate.cost.add }),
    ).not.toBeInTheDocument();
  });
});

describe("read-only revisions", () => {
  it("shows a submitted revision without a single input or edit control", async () => {
    respond(detail({ status: "submitted", requestStatus: "estimated" }));
    renderPage();
    await screen.findByTestId("revision-total");

    expect(screen.queryByLabelText("Số lượng CB-3X4")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Đơn giá CB-3X4")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Số lượng tủ MSB-01"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(viEstimate.panel.add)).not.toBeInTheDocument();
    expect(screen.queryByText(viEstimate.cost.add)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Xoá dòng CB-3X4")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: viEstimate.submit }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(viEstimate.readOnlySubmitted)).toBeInTheDocument();
    expect(amountOf("revision-total")).toBe("12.573.708");
    // The way to change it is a new revision.
    expect(
      screen.getByRole("button", { name: viEstimate.revise }),
    ).toBeInTheDocument();
  });

  it("offers no revision once the request is quoted", async () => {
    respond(detail({ status: "submitted", requestStatus: "quoted" }));
    renderPage();
    await screen.findByTestId("revision-total");

    expect(
      screen.queryByRole("button", { name: viEstimate.revise }),
    ).not.toBeInTheDocument();
  });

  it("treats a draft as read-only for a reader without estimate:update", async () => {
    grant(EstimatePermission.read, ItemPermission.referencePriceRead);
    renderPage();
    await screen.findByTestId("revision-total");

    expect(screen.queryByLabelText("Số lượng CB-3X4")).not.toBeInTheDocument();
    expect(screen.queryByText(viEstimate.panel.add)).not.toBeInTheDocument();
    expect(screen.getByText(viEstimate.readOnlyNoRights)).toBeInTheDocument();
  });

  it("shows an older revision for viewing only, with no revise or submit", async () => {
    respond(detail({ status: "superseded", latestRevision: 2, revision: 1 }));
    renderPage();
    await screen.findByTestId("revision-total");

    expect(screen.queryByLabelText("Số lượng CB-3X4")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: viEstimate.revise }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: viEstimate.submit }),
    ).not.toBeInTheDocument();
  });
});

describe("without prices", () => {
  const MONEY_HEADERS = [
    viEstimate.total,
    viEstimate.panel.unitCost,
    viEstimate.panel.total,
    viEstimate.bom.unitCost,
    viEstimate.bom.amount,
    viEstimate.cost.title,
    viEstimate.cost.amount,
    viEstimate.summary.total,
  ];

  function expectNoMoney() {
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("₫");
    expect(text).not.toContain("NaN");
    expect(screen.queryByTestId("revision-total")).not.toBeInTheDocument();
    expect(screen.queryByTestId("panel-total")).not.toBeInTheDocument();
    expect(screen.queryByTestId("panel-unit-cost")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bom-amount-11")).not.toBeInTheDocument();
    for (const header of MONEY_HEADERS) {
      expect(screen.queryByText(header)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(viEstimate.cost.add)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Đơn giá CB-3X4")).not.toBeInTheDocument();
  }

  it("shows the assigned engineer the panels and quantities with no money", async () => {
    actorUser.value = { id: 30, role: "engineer" };
    grant(...ENGINEER);
    respond(withoutMoney(detail()));
    renderPage();

    expect(await screen.findByLabelText("Số lượng CB-3X4")).toBeInTheDocument();
    expect(screen.getAllByText("MSB-02").length).toBeGreaterThan(0);
    expectNoMoney();
    // A zero where a price would be is as much a leak as the price.
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("keeps the engineering lead writing without any price", async () => {
    actorUser.value = { id: 99, role: "engineeringLead" };
    grant(...ENGINEER);
    respond(withoutMoney(detail()));
    renderPage();

    expect(await screen.findByLabelText("Số lượng CB-3X4")).toBeInTheDocument();
    expect(screen.getByText(viEstimate.panel.add)).toBeInTheDocument();
    expectNoMoney();
  });

  it("shows a submitted revision to an engineer with no money", async () => {
    actorUser.value = { id: 30, role: "engineer" };
    grant(EstimatePermission.read);
    respond(
      withoutMoney(detail({ status: "submitted", requestStatus: "estimated" })),
    );
    renderPage();

    expect((await screen.findAllByText("MSB-01")).length).toBeGreaterThan(0);
    expectNoMoney();
  });
});
