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
import viQuotation from "@/kernel/langs/vi/quotation.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { QuotationDetailPage } from "@plugins/sales/quotation/components/QuotationDetailPage";
import { QuotationPermission } from "@plugins/sales/quotation/permissions/quotation-permission.keys";

const apiGet = vi.hoisted(() => vi.fn());
const apiPatch = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, patch: apiPatch, post: vi.fn(), delete: vi.fn() },
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
  useParams: () => ({ id: "9" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/sales/quotations/9",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

function bom(id: number, code: string, name: string, quantity: number) {
  return {
    id,
    itemCode: code,
    itemName: name,
    itemBrand: "Schneider",
    itemUnit: "Cái",
    quantity,
  };
}

/** The two-panel worked example at margin 0, as the server stores a fresh draft. */
function lines() {
  return [
    {
      id: 1,
      tag: "MSB-01",
      description: "Main board",
      quantity: 2,
      unitCost: 1234567,
      marginPercent: 0,
      unitPrice: 1234567,
      amount: 2469134,
      bomLines: [
        bom(11, "CB-3X4", "Cable 3x4", 12.5),
        bom(12, "MCCB-3P", "MCCB 3P", 3),
      ],
      costLines: [{ id: 21, category: "design", description: null }],
    },
    {
      id: 2,
      tag: "DB-02",
      description: null,
      quantity: 1,
      unitCost: 500000,
      marginPercent: 0,
      unitPrice: 500000,
      amount: 500000,
      bomLines: [bom(13, "RELAY", "Relay", 2)],
      costLines: [],
    },
  ];
}

interface DetailOptions {
  status?: string;
  ver?: number;
  latestVer?: number;
}

function detail(options: DetailOptions = {}) {
  const { status = "draft", ver = 1, latestVer = 1 } = options;
  return {
    id: 9,
    code: "03-08092026/BG",
    requestId: 5,
    estimateId: 7,
    latestVer,
    request: {
      id: 5,
      code: "YC_2026_0001",
      title: "Panel line control cabinet",
      status: "estimated",
      customerId: 3,
      customerName: "Alpha Panels",
      salesOwnerId: 11,
      salesOwnerName: "Sales A",
    },
    versions: Array.from({ length: latestVer }, (_, index) => ({
      ver: index + 1,
      status: index + 1 === latestVer ? status : "closed",
      total: 3206665,
    })),
    current: {
      id: 90 + ver,
      quotationId: 9,
      ver,
      status,
      estimateRevisionId: 71,
      estimateRevision: 1,
      discountType: "percent",
      discountValue: 0,
      vatRate: 8,
      subtotal: 2969134,
      discountAmount: 0,
      taxable: 2969134,
      vatAmount: 237531,
      total: 3206665,
      terms: ["Warranty 12 months"],
      lines: lines(),
    },
  };
}

function respond(body: object) {
  apiGet.mockImplementation((url: string) =>
    url === "/sales/quotations/9"
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
          quotation: viQuotation,
          status: viStatus,
        }}
      >
        <NotificationProvider>
          <QuotationDetailPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function grant(...permissions: string[]) {
  granted.value = new Set(permissions);
}

/** `3.363.511 ₫` with its no-break space, reduced to the digits and separators. */
const amountOf = (testId: string) =>
  (screen.getByTestId(testId).textContent ?? "").replace(/[^\d.]/g, "");

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  grant(QuotationPermission.read, QuotationPermission.update);
  respond(detail());
});

afterEach(cleanup);

describe("quotation draft editor", () => {
  it("shows the stored totals and each panel's materials under it", async () => {
    renderPage();

    await screen.findByTestId("quotation-total");

    expect(amountOf("quotation-subtotal")).toBe("2.969.134");
    expect(amountOf("quotation-vat")).toBe("237.531");
    expect(amountOf("quotation-total")).toBe("3.206.665");
    const first = within(screen.getByTestId("panel-bom-1"));
    expect(first.getByText("Cable 3x4")).toBeInTheDocument();
    expect(first.getByText("MCCB-3P")).toBeInTheDocument();
    expect(within(screen.getByTestId("panel-bom-2")).getByText("Relay"));
  });

  it("follows margins, discount and VAT as they are typed: the worked example totals 3.363.511", async () => {
    renderPage();
    await screen.findByTestId("quotation-total");

    type("Biên lợi nhuận của tủ MSB-01", "12.5");
    type("Biên lợi nhuận của tủ DB-02", "0.1");
    type("Giá trị chiết khấu", "5");

    expect(amountOf("unit-price-1")).toBe("1.388.888");
    expect(amountOf("amount-1")).toBe("2.777.776");
    expect(amountOf("unit-price-2")).toBe("500.500");
    expect(amountOf("quotation-subtotal")).toBe("3.278.276");
    expect(amountOf("quotation-discount")).toBe("163.914");
    expect(amountOf("quotation-taxable")).toBe("3.114.362");
    expect(amountOf("quotation-vat")).toBe("249.149");
    expect(amountOf("quotation-total")).toBe("3.363.511");
  });

  it("saves the typed margins, discount and VAT, and shows what the server answers", async () => {
    const stored = detail();
    apiPatch.mockResolvedValue({
      data: {
        ...stored,
        current: { ...stored.current, vatRate: 8, total: 3363511 },
      },
    });
    renderPage();
    await screen.findByTestId("quotation-total");

    expect(screen.getByRole("button", { name: "Lưu giá" })).toBeDisabled();
    type("Biên lợi nhuận của tủ MSB-01", "12.5");
    type("Biên lợi nhuận của tủ DB-02", "0.1");
    type("Giá trị chiết khấu", "5");
    fireEvent.click(screen.getByRole("button", { name: "Lưu giá" }));

    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    expect(apiPatch).toHaveBeenCalledWith("/sales/quotations/9", {
      lines: [
        { lineId: 1, marginPercent: 12.5 },
        { lineId: 2, marginPercent: 0.1 },
      ],
      discountType: "percent",
      discountValue: 5,
      vatRate: 8,
    });
    await waitFor(() => expect(amountOf("quotation-total")).toBe("3.363.511"));
  });

  it("holds the submit while a typed margin is not saved, and frees it once saved", async () => {
    grant(
      QuotationPermission.read,
      QuotationPermission.update,
      QuotationPermission.submit,
    );
    const stored = detail();
    const own = { ...stored, current: { ...stored.current, createdBy: 11 } };
    respond(own);
    const saved = {
      ...own,
      current: {
        ...own.current,
        lines: own.current.lines.map((line) =>
          line.id === 1 ? { ...line, marginPercent: 20 } : line,
        ),
      },
    };
    // Once saved, the server answers the stored margin on every read too.
    apiPatch.mockImplementation(() => {
      respond(saved);
      return Promise.resolve({ data: saved });
    });
    renderPage();
    await screen.findByTestId("quotation-total");
    const submit = () => screen.getByRole("button", { name: "Gửi duyệt" });
    expect(submit()).toBeEnabled();

    type("Biên lợi nhuận của tủ MSB-01", "20");

    expect(submit()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      viQuotation.approval.unsaved,
    );

    fireEvent.click(screen.getByRole("button", { name: "Lưu giá" }));
    await waitFor(() => expect(submit()).toBeEnabled());
    expect(screen.queryByText(viQuotation.approval.unsaved)).toBeNull();
  });

  it("offers only the VAT rates 0, 5, 8 and 10 percent", async () => {
    renderPage();
    await screen.findByTestId("quotation-total");

    fireEvent.mouseDown(screen.getByDisplayValue("8%"));

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      "0%",
      "5%",
      "8%",
      "10%",
    ]);
  });

  it("recomputes the VAT when another rate is picked", async () => {
    renderPage();
    await screen.findByTestId("quotation-total");

    fireEvent.mouseDown(screen.getByDisplayValue("8%"));
    fireEvent.mouseDown(await screen.findByRole("option", { name: "10%" }));

    // 2.969.134 × 10% = 296.913,4 → 296.913
    expect(amountOf("quotation-vat")).toBe("296.913");
    expect(amountOf("quotation-total")).toBe("3.266.047");
  });

  it("flags a discount above the subtotal and keeps Save off", async () => {
    renderPage();
    await screen.findByTestId("quotation-total");

    fireEvent.mouseDown(screen.getByDisplayValue("Phần trăm (%)"));
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Số tiền/ }));
    type("Giá trị chiết khấu", "99999999");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Chiết khấu không được vượt quá tiền hàng.",
    );
    expect(screen.getByRole("button", { name: "Lưu giá" })).toBeDisabled();
  });

  it("flags a margin above 1000 and keeps Save off", async () => {
    renderPage();
    await screen.findByTestId("quotation-total");

    type("Biên lợi nhuận của tủ MSB-01", "1000.5");

    expect(
      screen.getByLabelText("Biên lợi nhuận của tủ MSB-01"),
    ).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Lưu giá" })).toBeDisabled();
  });
});

describe("quotation read-only view", () => {
  it.each(["pending_approval", "approved", "rejected", "customer_confirmed"])(
    "a %s version has no inputs, no Save and shows the stored figures",
    async (status) => {
      respond(detail({ status }));
      renderPage();

      await screen.findByTestId("quotation-total");

      expect(
        screen.queryByLabelText("Biên lợi nhuận của tủ MSB-01"),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Giá trị chiết khấu")).toBeNull();
      expect(screen.queryByRole("button", { name: "Lưu giá" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: /Thuế suất VAT/ }),
      ).toBeNull();
      expect(amountOf("quotation-total")).toBe("3.206.665");
      // The materials stay visible on every version.
      expect(screen.getByText("Cable 3x4")).toBeInTheDocument();
    },
  );

  it("a draft is read-only for a reader without quotation:update", async () => {
    grant(QuotationPermission.read);
    renderPage();

    await screen.findByTestId("quotation-total");

    expect(screen.queryByRole("button", { name: "Lưu giá" })).toBeNull();
    expect(screen.queryByLabelText("Giá trị chiết khấu")).toBeNull();
  });

  it("an older version is view only, with a switcher to the latest", async () => {
    respond(detail({ status: "draft", ver: 1, latestVer: 2 }));
    renderPage();

    await screen.findByTestId("quotation-total");

    expect(screen.getByText(/phiên bản cũ/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu giá" })).toBeNull();
    expect(screen.getByText(/v2 · Nháp/)).toBeInTheDocument();
  });
});
