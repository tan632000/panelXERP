import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import viCommon from "@/kernel/langs/vi/common.json";
import viMaterial from "@/kernel/langs/vi/material.json";

import { EstimateVsActualTab } from "@plugins/inventory/material/components/EstimateVsActualTab";

import type { EstimateVsActualReport } from "@plugins/inventory/material/types";

const apiGet = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

/** O1 of the worked example, as a director reads it: with every cost. */
function pricedReport(): EstimateVsActualReport {
  return {
    order: {
      id: 1,
      code: "DH_2026_0001",
      status: "open",
      deliveryDate: "2026-11-05",
      createdAt: "2026-10-20T08:00:00.000Z",
      customerName: "Công ty Điện Nam",
      projectName: null,
      requestId: 9,
      salesOwnerId: 30,
      salesOwnerName: "Sales A",
    },
    items: [
      {
        itemId: 101,
        itemCode: "VT-X",
        itemName: "Aptomat 3P",
        itemUnit: "Cái",
        estimatedQty: 6,
        actualQty: 5,
        qtyVariance: -1,
        estimatedCost: 570000,
        actualCost: 509184,
        costVariance: -60816,
      },
      {
        itemId: 103,
        itemCode: "VT-Z",
        itemName: "Đầu cos",
        itemUnit: "Cái",
        estimatedQty: 0,
        actualQty: 1,
        qtyVariance: 1,
        estimatedCost: 0,
        actualCost: 20000,
        costVariance: 20000,
      },
    ],
    overBomIssues: [
      {
        issueCode: "XK_2026_0004",
        issuedAt: "2026-10-28T09:00:00.000Z",
        itemId: 103,
        itemCode: "VT-Z",
        itemName: "Đầu cos",
        quantity: 1,
        reason: "thay thế",
        panelTag: null,
      },
    ],
    unlinked: [],
    totals: { estimatedCost: 570000, actualCost: 529184, costVariance: -40816 },
  };
}

/** The same report as a storekeeper reads it: every cost key dropped. */
function quantitiesOnly(): EstimateVsActualReport {
  const report = pricedReport();
  delete report.totals;
  report.items = report.items.map(
    ({
      estimatedCost: _estimated,
      actualCost: _actual,
      costVariance: _variance,
      ...item
    }) => item,
  );
  return report;
}

function renderTab(report: EstimateVsActualReport) {
  apiGet.mockImplementation((url: string) =>
    url === "/inventory/materials/orders/1/estimate-vs-actual"
      ? Promise.resolve({ data: report })
      : Promise.reject(new Error(`Unexpected GET ${url}`)),
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, material: viMaterial }}
      >
        <EstimateVsActualTab orderId={1} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const labels = viMaterial.estimateVsActual;

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("EstimateVsActualTab", () => {
  it("shows estimated and actual cost next to the quantities when the API sent them", async () => {
    renderTab(pricedReport());

    expect(await screen.findByText(labels.columns.estimatedCost)).toBeInTheDocument();
    expect(screen.getByText(labels.columns.actualCost)).toBeInTheDocument();
    // On the item line and again in the totals.
    expect(screen.getAllByText(/570\.000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/509\.184/).length).toBeGreaterThan(0);
    expect(screen.getByText("thay thế")).toBeInTheDocument();
  });

  it("shows quantities and the over-BOM list but no cost column without purchase prices", async () => {
    renderTab(quantitiesOnly());

    expect(await screen.findByText(labels.columns.estimatedQty)).toBeInTheDocument();
    expect(screen.getByText("thay thế")).toBeInTheDocument();
    for (const header of [
      labels.columns.estimatedCost,
      labels.columns.actualCost,
      labels.columns.costVariance,
    ]) {
      expect(screen.queryByText(header)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/570\.000/)).not.toBeInTheDocument();
  });

  it("lists every estimate line not linked to an item", async () => {
    const report = quantitiesOnly();
    report.unlinked = [
      {
        bomLineId: 77,
        panelTag: "MSB-01",
        itemCode: "CU-OLD",
        itemName: "Thanh cái cũ",
        perPanelQuantity: 2,
      },
    ];
    renderTab(report);

    expect(await screen.findByText("Thanh cái cũ")).toBeInTheDocument();
    expect(screen.getByText("CU-OLD")).toBeInTheDocument();
    expect(screen.getByText(labels.columns.perPanel)).toBeInTheDocument();
  });
});
