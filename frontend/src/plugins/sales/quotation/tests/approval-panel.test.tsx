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

import {
  NotificationProvider,
  useNotification,
} from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viModal from "@/kernel/langs/vi/modal.json";
import viQuotation from "@/kernel/langs/vi/quotation.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { QuotationApprovalPanel } from "@plugins/sales/quotation/components/approval/QuotationApprovalPanel";
import { QuotationPermission } from "@plugins/sales/quotation/permissions/quotation-permission.keys";

import type { QuotationDetail } from "@plugins/sales/quotation/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const saved = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const viewer = vi.hoisted(() => ({ id: 20, role: "salesManager" }));
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
    user: { id: viewer.id, role: viewer.role },
    logout: vi.fn(),
  }),
  useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
}));

vi.mock("@/kernel/core/lib/download-blob", () => ({ downloadBlob: saved }));

const P = QuotationPermission;
/** Everything the quotation controls are gated on. */
const EVERYTHING = Object.values(P);

interface Options {
  status?: string;
  createdBy?: number;
  lastEditedBy?: number | null;
  stale?: boolean;
  ver?: number;
  latestVer?: number;
  decisionReason?: string | null;
}

/** The version of Sales A (11), the creator unless a spec says otherwise. */
function quotation(options: Options = {}): QuotationDetail {
  const {
    status = "draft",
    createdBy = 11,
    lastEditedBy = null,
    stale = false,
    ver = 1,
    latestVer = 1,
    decisionReason = null,
  } = options;
  return {
    id: 9,
    code: "03-25102026/BG",
    requestId: 5,
    estimateId: 7,
    latestVer,
    request: {
      id: 5,
      code: "YC_2026_0001",
      title: "Panel line control cabinet",
      status: "estimated",
      customerId: 3,
      salesOwnerId: 11,
    },
    versions: [],
    estimateStale: stale,
    current: {
      id: 91,
      quotationId: 9,
      ver,
      status,
      estimateRevisionId: 71,
      estimateRevision: 1,
      discountType: "percent",
      discountValue: 0,
      vatRate: 8,
      subtotal: 0,
      discountAmount: 0,
      taxable: 0,
      vatAmount: 0,
      total: 0,
      terms: [],
      createdBy,
      lastEditedBy,
      decisionReason,
      lines: [],
    },
  } as QuotationDetail;
}

/** Shows the toasts the provider holds, which the app renders elsewhere. */
function Toasts() {
  const { toasts } = useNotification();
  return (
    <ul>
      {toasts.map((toast) => (
        <li key={toast.id}>{toast.message}</li>
      ))}
    </ul>
  );
}

function renderPanel(detail: QuotationDetail) {
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
          quotation: viQuotation,
          status: viStatus,
        }}
      >
        <NotificationProvider>
          <QuotationApprovalPanel quotation={detail} />
          <Toasts />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const grant = (...permissions: string[]) => {
  granted.value = new Set(permissions);
};
const labels = viQuotation.approval;
const button = (name: string) => screen.queryByRole("button", { name });

beforeEach(() => {
  vi.clearAllMocks();
  viewer.id = 20;
  viewer.role = "salesManager";
  grant(...EVERYTHING);
  apiPost.mockResolvedValue({ data: quotation() });
});

afterEach(cleanup);

describe("approval panel: draft", () => {
  it("submits the draft for approval", async () => {
    renderPanel(quotation());

    fireEvent.click(screen.getByRole("button", { name: labels.submit }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith(
      "/sales/quotations/9/submit",
      undefined,
    );
  });

  it("offers a refresh and blocks the submit while the estimate is stale", async () => {
    renderPanel(quotation({ stale: true }));

    expect(screen.getByRole("alert")).toHaveTextContent(labels.stale);
    expect(screen.getByRole("button", { name: labels.submit })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: labels.refresh }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith(
      "/sales/quotations/9/refresh-estimate",
      undefined,
    );
  });

  it("shows no refresh and no alert on a current draft", () => {
    renderPanel(quotation());

    expect(button(labels.refresh)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hides the submit and the refresh from a reader without those rights", () => {
    grant(P.read);
    renderPanel(quotation({ stale: true }));

    expect(button(labels.submit)).toBeNull();
    expect(button(labels.refresh)).toBeNull();
  });

  it("hides the submit from a sales owner who did not create the version", () => {
    viewer.id = 11;
    viewer.role = "sales";
    renderPanel(quotation({ createdBy: 20 }));

    expect(button(labels.submit)).toBeNull();
  });

  it("lets the creator submit, whatever their role", () => {
    viewer.id = 11;
    viewer.role = "sales";
    renderPanel(quotation({ createdBy: 11 }));

    expect(button(labels.submit)).not.toBeNull();
  });

  it("lets a manager submit a draft that someone else created", () => {
    renderPanel(quotation({ createdBy: 11 }));

    expect(button(labels.submit)).not.toBeNull();
  });

  it("tells the user to lower a fixed discount when a refresh would exceed the subtotal", async () => {
    apiPost.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: { message: "The discount cannot exceed the subtotal." },
      },
    });
    renderPanel(quotation({ stale: true }));

    fireEvent.click(screen.getByRole("button", { name: labels.refresh }));

    expect(
      await screen.findByText(viQuotation.toast.refreshDiscountTooLarge),
    ).toBeInTheDocument();
  });

  it("offers no revise on a draft, which is edited instead", () => {
    renderPanel(quotation());

    expect(button(labels.revise)).toBeNull();
  });
});

describe("approval panel: deciding", () => {
  it("lets an approver who is not the creator approve in one click", async () => {
    renderPanel(quotation({ status: "pending_approval" }));

    fireEvent.click(screen.getByRole("button", { name: labels.approve }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith(
      "/sales/quotations/9/approve",
      undefined,
    );
  });

  it("withholds approve and reject from the version's own creator", () => {
    viewer.id = 11;
    renderPanel(quotation({ status: "pending_approval", createdBy: 11 }));

    expect(button(labels.approve)).toBeNull();
    expect(button(labels.reject)).toBeNull();
    expect(screen.getByText(labels.creatorCannotDecide)).toBeInTheDocument();
  });

  it("withholds approve and reject from the last editor of the price or terms", () => {
    viewer.id = 20;
    renderPanel(
      quotation({
        status: "pending_approval",
        createdBy: 11,
        lastEditedBy: 20,
      }),
    );

    expect(button(labels.approve)).toBeNull();
    expect(button(labels.reject)).toBeNull();
    expect(screen.getByText(labels.creatorCannotDecide)).toBeInTheDocument();
  });

  it("still lets another approver decide on a version someone else edited", () => {
    renderPanel(
      quotation({
        status: "pending_approval",
        createdBy: 11,
        lastEditedBy: 30,
      }),
    );

    expect(button(labels.approve)).not.toBeNull();
    expect(button(labels.reject)).not.toBeNull();
  });

  it("hides approve and reject from a reader who cannot approve", () => {
    grant(P.read, P.update, P.submit, P.confirm, P.cancel, P.export);
    renderPanel(quotation({ status: "pending_approval" }));

    expect(button(labels.approve)).toBeNull();
    expect(button(labels.reject)).toBeNull();
    expect(
      screen.queryByText(labels.creatorCannotDecide),
    ).not.toBeInTheDocument();
  });

  it("needs a reason to reject, and sends it trimmed", async () => {
    renderPanel(quotation({ status: "pending_approval" }));

    fireEvent.click(screen.getByRole("button", { name: labels.reject }));
    const confirm = await screen.findByRole("button", {
      name: labels.rejectSubmit,
    });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(labels.reason.placeholder), {
      target: { value: "  Margin too thin  " },
    });
    fireEvent.click(screen.getByRole("button", { name: labels.rejectSubmit }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/sales/quotations/9/reject", {
      reason: "Margin too thin",
    });
  });

  it("shows why a version was rejected", () => {
    renderPanel(
      quotation({ status: "rejected", decisionReason: "Margin too thin" }),
    );

    expect(screen.getByText(/Margin too thin/)).toBeInTheDocument();
  });
});

describe("approval panel: revising", () => {
  it.each(["pending_approval", "approved", "rejected"])(
    "offers a new version from a %s one",
    async (status) => {
      renderPanel(quotation({ status }));

      fireEvent.click(screen.getByRole("button", { name: labels.revise }));

      await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
      expect(apiPost).toHaveBeenCalledWith(
        "/sales/quotations/9/revise",
        undefined,
      );
    },
  );

  it.each(["draft", "customer_confirmed", "cancelled"])(
    "offers none from a %s one",
    (status) => {
      renderPanel(quotation({ status }));

      expect(button(labels.revise)).toBeNull();
    },
  );

  it("hides the revise from a reader without quotation:update", () => {
    grant(P.read, P.approve);
    renderPanel(quotation({ status: "pending_approval" }));

    expect(button(labels.revise)).toBeNull();
  });
});

describe("approval panel: after approval", () => {
  it("confirms the customer's acceptance of an approved version", async () => {
    renderPanel(quotation({ status: "approved" }));

    fireEvent.click(screen.getByRole("button", { name: labels.confirm }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith(
      "/sales/quotations/9/confirm",
      undefined,
    );
  });

  it("offers no confirm before approval", () => {
    renderPanel(quotation({ status: "pending_approval" }));

    expect(button(labels.confirm)).toBeNull();
  });

  it.each([
    ["xlsx", labels.exportXlsx],
    ["pdf", labels.exportPdf],
  ])(
    "downloads the %s file named after the quotation",
    async (format, label) => {
      apiGet.mockResolvedValue({ data: new Blob(["file"]) });
      renderPanel(quotation({ status: "approved" }));

      fireEvent.click(screen.getByRole("button", { name: label }));

      await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
      expect(apiGet).toHaveBeenCalledWith(
        `/sales/quotations/9/export.${format}`,
        { responseType: "blob" },
      );
      expect(saved).toHaveBeenCalledWith(
        expect.any(Blob),
        `03-25102026-BG.${format}`,
      );
    },
  );

  it("still offers the downloads once the customer has confirmed", () => {
    renderPanel(quotation({ status: "customer_confirmed" }));

    expect(button(labels.exportXlsx)).not.toBeNull();
    expect(button(labels.exportPdf)).not.toBeNull();
    expect(button(labels.confirm)).toBeNull();
  });

  it.each(["draft", "pending_approval", "rejected"])(
    "offers no download for a %s version",
    (status) => {
      renderPanel(quotation({ status }));

      expect(button(labels.exportXlsx)).toBeNull();
      expect(button(labels.exportPdf)).toBeNull();
    },
  );

  it("hides the downloads from a reader without quotation:export", () => {
    grant(P.read, P.confirm);
    renderPanel(quotation({ status: "approved" }));

    expect(button(labels.exportXlsx)).toBeNull();
    expect(button(labels.exportPdf)).toBeNull();
  });
});

describe("approval panel: cancelling", () => {
  it("needs a reason, warns that the request is lost, and sends it trimmed", async () => {
    renderPanel(quotation({ status: "approved" }));

    fireEvent.click(screen.getByRole("button", { name: labels.cancel }));
    expect(
      await screen.findByText(labels.cancelDescription),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: labels.cancelSubmit }),
    ).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(labels.reason.placeholder), {
      target: { value: "  Customer chose a rival " },
    });
    fireEvent.click(screen.getByRole("button", { name: labels.cancelSubmit }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/sales/quotations/9/cancel", {
      reason: "Customer chose a rival",
    });
  });

  it.each(["customer_confirmed", "cancelled"])(
    "offers no cancel for a %s quotation",
    (status) => {
      renderPanel(quotation({ status }));

      expect(button(labels.cancel)).toBeNull();
    },
  );
});

describe("approval panel: older versions", () => {
  it("renders nothing for a version that is not the latest", () => {
    renderPanel(quotation({ status: "closed", ver: 1, latestVer: 2 }));

    expect(screen.queryByRole("button")).toBeNull();
  });
});
