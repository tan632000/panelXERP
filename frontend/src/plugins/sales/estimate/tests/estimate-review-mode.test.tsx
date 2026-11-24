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
    user: { id: 30, role: "engineer" },
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

interface LineOptions {
  ai?: boolean;
  verified?: boolean;
}

function line(id: number, code: string, options: LineOptions = {}) {
  return {
    id,
    itemId: id + 100,
    itemCode: code,
    itemName: `Name ${code}`,
    itemBrand: "Schneider",
    itemUnit: "Cái",
    quantity: 2,
    unitCost: 1000,
    amount: 2000,
    note: null,
    isAiGenerated: options.ai ?? false,
    aiConfidence: options.ai ? 0.85 : null,
    aiNote: options.ai ? `Matched ${code} by rating` : null,
    isVerified: options.verified ?? false,
  };
}

/** One panel: two unverified AI lines, one verified AI line and one manual line. */
function revision(lines: Array<ReturnType<typeof line>>) {
  return {
    id: 71,
    estimateId: 7,
    revision: 1,
    status: "draft",
    total: 8000,
    submittedAt: null,
    unverifiedAiCount: lines.filter((l) => l.isAiGenerated && !l.isVerified)
      .length,
    panels: [
      {
        id: 1,
        tag: "MSB-01",
        description: null,
        quantity: 1,
        unitCost: 8000,
        total: 8000,
        isAiGenerated: lines.some((l) => l.isAiGenerated),
        aiNote: lines.some((l) => l.isAiGenerated)
          ? "Panel from template"
          : null,
        bomLines: lines,
        costLines: [],
      },
    ],
  };
}

const AI_LINES = [
  line(11, "AI-A", { ai: true }),
  line(12, "AI-B", { ai: true }),
  line(13, "AI-C", { ai: true, verified: true }),
  line(14, "MAN-D"),
];

function detail(current: ReturnType<typeof revision>) {
  return {
    id: 7,
    code: "DT_2027_0001",
    requestId: 5,
    status: "draft",
    latestRevision: 1,
    total: current.total,
    request: {
      id: 5,
      code: "YC_2027_0001",
      title: "Panel line control cabinet",
      status: "estimating",
      customerName: "Alpha Panels",
      salesOwnerId: 11,
      assignedEngineerId: 30,
      assignedEngineerName: "Engineer A",
    },
    revisions: [{ revision: 1, status: "draft", total: current.total }],
    current,
  };
}

function withoutMoney(current: ReturnType<typeof revision>) {
  const { total: _total, ...rest } = current;
  return {
    ...rest,
    panels: current.panels.map(
      ({ unitCost: _u, total: _t, costLines: _c, ...panel }) => ({
        ...panel,
        bomLines: panel.bomLines.map(
          ({ unitCost: _bu, amount: _a, ...bom }) => bom,
        ),
      }),
    ),
  };
}

function respond(current: object) {
  apiGet.mockImplementation((url: string) =>
    url === "/sales/estimates/7"
      ? Promise.resolve({
          data: detail(current as ReturnType<typeof revision>),
        })
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
        <NotificationProvider>
          <EstimateDetailPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const ENGINEER = [
  EstimatePermission.read,
  EstimatePermission.update,
  EstimatePermission.submit,
  EstimatePermission.create,
];

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set(ENGINEER);
  respond(revision(AI_LINES));
});

afterEach(cleanup);

describe("review mode", () => {
  it("marks AI lines that are not verified, with confidence and note, and leaves manual lines plain", async () => {
    renderPage();
    await screen.findByLabelText("Số lượng AI-A");

    const aiRow = screen.getByLabelText("Số lượng AI-A").closest("tr");
    expect(within(aiRow as HTMLElement).getByText("AI")).toBeInTheDocument();
    expect(within(aiRow as HTMLElement).getByText("85%")).toBeInTheDocument();
    expect(
      within(aiRow as HTMLElement).getByText("Matched AI-A by rating"),
    ).toBeInTheDocument();
    expect(aiRow).toHaveAttribute("data-ai-unverified", "true");

    const verifiedRow = screen.getByLabelText("Số lượng AI-C").closest("tr");
    expect(verifiedRow).not.toHaveAttribute("data-ai-unverified");
    expect(
      within(verifiedRow as HTMLElement).getByLabelText(
        viEstimate.review.verified,
      ),
    ).toBeInTheDocument();

    const manualRow = screen.getByLabelText("Số lượng MAN-D").closest("tr");
    expect(within(manualRow as HTMLElement).queryByText("AI")).toBeNull();
    expect(
      screen.queryByLabelText("Xác nhận dòng MAN-D"),
    ).not.toBeInTheDocument();
  });

  it("verifies one line through the API and shows it verified", async () => {
    apiPatch.mockResolvedValue({
      data: revision([
        line(11, "AI-A", { ai: true, verified: true }),
        ...AI_LINES.slice(1),
      ]),
    });
    renderPage();
    await screen.findByLabelText("Số lượng AI-A");

    fireEvent.click(screen.getByLabelText("Xác nhận dòng AI-A"));

    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    expect(apiPatch).toHaveBeenCalledWith(
      "/sales/estimates/7/bom-lines/11/verify",
    );
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Xác nhận dòng AI-A"),
      ).not.toBeInTheDocument(),
    );
    const row = screen.getByLabelText("Số lượng AI-A").closest("tr");
    expect(row).not.toHaveAttribute("data-ai-unverified");
  });

  it("verifies every AI line at once", async () => {
    apiPost.mockResolvedValue({
      data: revision(
        AI_LINES.map((l) => ({ ...l, isVerified: l.isAiGenerated })),
      ),
    });
    renderPage();
    await screen.findByLabelText("Số lượng AI-A");

    fireEvent.click(
      screen.getByRole("button", { name: viEstimate.review.verifyAll }),
    );

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/sales/estimates/7/verify");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: viEstimate.review.verifyAll }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe("submit with unverified AI lines", () => {
  it("warns with the count but does not block, and Vẫn gửi submits", async () => {
    apiPost.mockResolvedValue({ data: {} });
    renderPage();
    await screen.findByLabelText("Số lượng AI-A");

    const submit = screen.getByRole("button", { name: viEstimate.submit });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await screen.findByText("Còn 2 dòng AI chưa được xác nhận.");
    expect(apiPost).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: viEstimate.review.submitAnyway }),
    );

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/sales/estimates/7/submit");
  });

  it("shows no warning once every AI line is verified", async () => {
    respond(
      revision(AI_LINES.map((l) => ({ ...l, isVerified: l.isAiGenerated }))),
    );
    renderPage();
    await screen.findByLabelText("Số lượng AI-A");

    fireEvent.click(screen.getByRole("button", { name: viEstimate.submit }));
    await screen.findByText("Gửi dự toán DT_2027_0001");

    expect(screen.queryByText(/dòng AI chưa được xác nhận/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: viEstimate.review.submitAnyway }),
    ).not.toBeInTheDocument();
  });
});

describe("prices stay gated", () => {
  it("renders no price column or total on AI lines without reference_price:read", async () => {
    respond(withoutMoney(revision(AI_LINES)));
    renderPage();
    await screen.findByLabelText("Số lượng AI-A");

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("₫");
    expect(text).not.toContain("NaN");
    expect(screen.queryByText(viEstimate.bom.unitCost)).toBeNull();
    expect(screen.queryByText(viEstimate.bom.amount)).toBeNull();
    expect(screen.queryByTestId("bom-amount-11")).toBeNull();
    // The AI marks still show: they carry no money.
    expect(screen.getAllByText("AI").length).toBeGreaterThan(0);
  });

  it("still shows the price columns when the actor may read prices", async () => {
    granted.value = new Set([...ENGINEER, ItemPermission.referencePriceRead]);
    renderPage();
    await screen.findByLabelText("Số lượng AI-A");

    expect(screen.getByTestId("bom-amount-11")).toBeInTheDocument();
  });
});

describe("an estimate without AI lines", () => {
  it("renders no AI mark, verify control or warning", async () => {
    respond(revision([line(14, "MAN-D"), line(15, "MAN-E")]));
    renderPage();
    await screen.findByLabelText("Số lượng MAN-D");

    expect(screen.queryByText("AI")).toBeNull();
    expect(screen.queryByLabelText(/^Xác nhận dòng/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: viEstimate.review.verifyAll }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: viEstimate.submit }));
    await screen.findByText("Gửi dự toán DT_2027_0001");
    expect(screen.queryByText(/dòng AI chưa được xác nhận/)).toBeNull();
  });
});
