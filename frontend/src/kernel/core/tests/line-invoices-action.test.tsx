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
  LINE_INVOICE_NO_DATE_FIELDS,
  LineInvoicesAction,
} from "@/kernel/core/components/ui/LineInvoicesAction";
import viCommon from "@/kernel/langs/vi/common.json";

const { auth, patch } = vi.hoisted(() => ({
  auth: { role: "purchasing", permissions: [] as string[] },
  patch: vi.fn(),
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({
    user: { role: auth.role },
    can: (permission: string) =>
      auth.permissions.includes("*:*") || auth.permissions.includes(permission),
  }),
}));
vi.mock("@/kernel/core/api/api", () => ({ default: { patch } }));
vi.mock("@/kernel/core/contexts/NotificationContext", () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

const LINES = [
  {
    id: 11,
    label: "VT_0001",
    description: "Steel wire",
    invoiceNo: "HD-01",
    invoiceDate: "2026-10-01",
    invoiceForm: "01GTKT",
    invoiceSerial: "1C26AA",
  },
  { id: 12, label: "VT_0002", invoiceNo: null, invoiceDate: null },
];

function renderAction(
  overrides: Partial<Parameters<typeof LineInvoicesAction>[0]> = {},
) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <LineInvoicesAction
          endpoint="/receipts/1/invoices"
          lines={LINES}
          invalidateKey={["receipts"]}
          {...overrides}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { invalidate };
}

afterEach(cleanup);
beforeEach(() => {
  auth.role = "purchasing";
  auth.permissions = [];
  patch.mockReset().mockResolvedValue({ data: {} });
});

describe("line invoices action", () => {
  it("is hidden from a role outside the purchasing team", () => {
    auth.role = "engineer";
    renderAction();

    expect(
      screen.queryByRole("button", { name: viCommon.lineInvoices.button }),
    ).toBeNull();
  });

  it("sends only the invoice fields of every line", async () => {
    const { invalidate } = renderAction({
      fields: LINE_INVOICE_NO_DATE_FIELDS,
    });

    fireEvent.click(
      screen.getByRole("button", { name: viCommon.lineInvoices.button }),
    );
    // One supplier invoice covers the receipt: the first line is copied down.
    fireEvent.click(screen.getByText(viCommon.lineInvoices.applyFirstToAll));
    fireEvent.click(screen.getByText(viCommon.lineInvoices.save));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith("/receipts/1/invoices", {
      lines: [
        { id: 11, invoiceNo: "HD-01", invoiceDate: "2026-10-01" },
        { id: 12, invoiceNo: "HD-01", invoiceDate: "2026-10-01" },
      ],
    });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["receipts"] }),
    );
  });

  describe("a document with its own invoice scope", () => {
    const SCOPE = "raw_material_receipt_ok:invoice:write";
    const button = () =>
      screen.queryByRole("button", { name: viCommon.lineInvoices.button });

    it("shows the button to a holder of the scope, whatever its role", () => {
      auth.role = "engineer";
      auth.permissions = [SCOPE];
      renderAction({ permission: SCOPE });

      expect(button()).not.toBeNull();
    });

    it("hides it from a purchasing role that does not hold the scope", () => {
      auth.role = "purchasing";
      auth.permissions = ["raw_material_receipt_ok:read"];
      renderAction({ permission: SCOPE });

      expect(button()).toBeNull();
    });

    it("does not accept another document's invoice scope", () => {
      auth.permissions = ["xlbm_receipt_ok:invoice:write"];
      renderAction({ permission: SCOPE });

      expect(button()).toBeNull();
    });
  });

  it.each([
    ["sales", false],
    ["purchasing", true],
  ])(
    "keeps the role list for a document with no scope yet: %s -> %s",
    (role, shown) => {
      auth.role = role;
      renderAction();

      expect(
        screen.queryByRole("button", { name: viCommon.lineInvoices.button }) !==
          null,
      ).toBe(shown);
    },
  );
});
