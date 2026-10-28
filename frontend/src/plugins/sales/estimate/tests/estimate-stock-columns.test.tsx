import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import viCommon from "@/kernel/langs/vi/common.json";
import viEstimate from "@/kernel/langs/vi/estimate.json";

import { StockPermission } from "@plugins/inventory/stock/permissions/stock-permission.keys";
import { EstimateBomGrid } from "@plugins/sales/estimate/components/EstimateBomGrid";

import type { EstimateEditor } from "@plugins/sales/estimate/hooks/useEstimateEditor";
import type {
  EstimateBomLine,
  EstimatePanel,
} from "@plugins/sales/estimate/types";

const apiGet = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({
    can,
    permissions: [...granted.value],
    user: { id: 21, role: "engineer" },
    logout: vi.fn(),
  }),
  useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
}));

function line(id: number, itemId: number, quantity: number): EstimateBomLine {
  return {
    id,
    itemId,
    itemCode: `VT-${itemId}`,
    itemName: `Item ${itemId}`,
    itemBrand: null,
    itemUnit: "Cái",
    quantity,
    unitCost: 1000,
    amount: quantity * 1000,
    note: null,
  };
}

function panel(
  id: number,
  quantity: number,
  bomLines: EstimateBomLine[],
): EstimatePanel {
  return {
    id,
    tag: `P-${id}`,
    quantity,
    unitCost: 0,
    total: 0,
    bomLines,
    costLines: [],
  };
}

const idle = { isPending: false, mutate: vi.fn() };
const editor = {
  drafts: {},
  setDraft: vi.fn(),
  commit: vi.fn(),
  edits: {
    addBomLine: idle,
    updateBomLine: idle,
    deleteBomLine: idle,
  },
  unsaved: false,
  busy: false,
} as unknown as EstimateEditor;

/** Answers the availability read with `available` per item id (on hand one more). */
function respond(available: Record<number, number>) {
  apiGet.mockImplementation((url: string) =>
    url === "/inventory/stock/availability"
      ? Promise.resolve({
          data: Object.entries(available).map(([itemId, value]) => ({
            itemId: Number(itemId),
            onHand: value + 1,
            reserved: 1,
            available: value,
          })),
        })
      : Promise.resolve({ data: { data: [], meta: { total: 0 } } }),
  );
}

function renderGrid(
  shown: EstimatePanel,
  revisionPanels: EstimatePanel[],
  editable = false,
) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, estimate: viEstimate }}
      >
        <EstimateBomGrid
          panel={shown}
          revisionPanels={revisionPanels}
          editor={editor}
          editable={editable}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const shortOf = (lineId: number) =>
  screen.getByTestId(`bom-stock-short-${lineId}`).textContent;

const availabilityCalls = () =>
  apiGet.mock.calls.filter(([url]) => url === "/inventory/stock/availability");

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set([StockPermission.availability]);
});

afterEach(cleanup);

describe("EstimateBomGrid stock columns", () => {
  it("shows the shortage of 4 per panel over 2 panels against 5 available", async () => {
    respond({ 501: 5 });
    const only = panel(1, 2, [line(11, 501, 4)]);
    renderGrid(only, [only]);

    await waitFor(() => expect(shortOf(11)).toBe("3"));
    expect(screen.getByTestId("bom-stock-onHand-11").textContent).toBe("6");
    expect(screen.getByTestId("bom-stock-available-11").textContent).toBe("5");
    expect(screen.getByText(viEstimate.bom.short)).toBeInTheDocument();
  });

  it("counts an item across every panel of the revision, not per line", async () => {
    respond({ 502: 5 });
    const first = panel(1, 1, [line(11, 502, 4)]);
    const second = panel(2, 1, [line(12, 502, 4)]);
    renderGrid(first, [first, second]);

    // 4 + 4 needed against 5 available: a per-line reading would show 0.
    await waitFor(() => expect(shortOf(11)).toBe("3"));
    expect(availabilityCalls()[0][1]).toEqual({
      params: { itemIds: "502" },
    });
  });

  it("finds no shortage for 0.1 per panel over 3 panels against 0.3 available", async () => {
    respond({ 503: 0.3 });
    const only = panel(1, 3, [line(11, 503, 0.1)]);
    renderGrid(only, [only]);

    // In float, 0.1 × 3 is 0.30000000000000004 and would leave a sliver short.
    await waitFor(() =>
      expect(screen.getByTestId("bom-stock-available-11").textContent).toBe(
        "0,3",
      ),
    );
    expect(shortOf(11)).toBe("0");
  });

  it("hides the columns and sends no request without stock:availability", async () => {
    granted.value = new Set();
    respond({ 501: 5 });
    const only = panel(1, 2, [line(11, 501, 4)]);
    renderGrid(only, [only]);

    expect(screen.getByText("VT-501")).toBeInTheDocument();
    expect(screen.queryByText(viEstimate.bom.short)).not.toBeInTheDocument();
    expect(screen.queryByText(viEstimate.bom.onHand)).not.toBeInTheDocument();
    expect(screen.queryByTestId("bom-stock-short-11")).not.toBeInTheDocument();
    expect(availabilityCalls()).toHaveLength(0);
  });

  it("shows a placeholder while loading and a dash on error, leaving the quantity editable", async () => {
    let fail: (reason: Error) => void = () => undefined;
    apiGet.mockImplementation((url: string) =>
      url === "/inventory/stock/availability"
        ? new Promise((_, reject) => {
            fail = reject;
          })
        : Promise.resolve({ data: { data: [], meta: { total: 0 } } }),
    );
    const only = panel(1, 2, [line(11, 501, 4)]);
    renderGrid(only, [only], true);

    expect(
      await screen.findAllByLabelText(viEstimate.bom.stockLoading),
    ).toHaveLength(3);

    fail(new Error("stock down"));
    await waitFor(() => expect(shortOf(11)).toBe(viEstimate.emptyValue));
    expect(
      screen.getByLabelText(
        viEstimate.bom.quantityOf.replace("{code}", "VT-501"),
      ),
    ).not.toBeDisabled();
  });
});
