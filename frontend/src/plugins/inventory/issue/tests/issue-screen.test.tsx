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
import viIssue from "@/kernel/langs/vi/issue.json";

import { IssueScreen } from "@plugins/inventory/issue/components/IssueScreen";
import { WorkshopReturnScreen } from "@plugins/inventory/issue/components/WorkshopReturnScreen";

import type { OrderMaterialDetail } from "@plugins/inventory/material/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => {
  const can = () => true;
  return {
    useAuth: () => ({
      can,
      permissions: [],
      user: { id: 40, role: "storekeeper" },
      logout: vi.fn(),
    }),
    useOptionalAuth: () => ({ can, permissions: [] }),
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams("orderId=4"),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/inventory/issues/new",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

/** O-4: X fully issued against its BOM of 6, Y not issued; panel MSB-01 holds both, DB-02 only Y. */
function openOrder(): OrderMaterialDetail {
  return {
    order: {
      id: 4,
      code: "DH_2026_0004",
      status: "open",
      deliveryDate: "2026-11-05",
      createdAt: "2026-10-20T08:00:00.000Z",
      customerName: "Công ty Điện Nam",
      projectName: null,
      requestId: 9,
      salesOwnerId: 30,
      salesOwnerName: "Sales A",
    },
    demandBearing: true,
    items: [
      {
        itemId: 101,
        itemCode: "VT-X",
        itemName: "Aptomat 3P",
        itemUnit: "Cái",
        demand: 6,
        reserved: 0,
        issued: 6,
        returned: 0,
        short: 0,
      },
      {
        itemId: 102,
        itemCode: "VT-Y",
        itemName: "Cáp 4x16",
        itemUnit: "m",
        demand: 4,
        reserved: 4,
        issued: 0,
        returned: 0,
        short: 0,
      },
    ],
    panels: [
      {
        lineId: 1,
        tag: "MSB-01",
        description: null,
        quantity: 1,
        bomLines: [
          {
            bomLineId: 11,
            itemId: 101,
            itemCode: "VT-X",
            itemName: "Aptomat 3P",
            itemUnit: "Cái",
            perPanelQuantity: 6,
            demand: 6,
          },
          {
            bomLineId: 12,
            itemId: 102,
            itemCode: "VT-Y",
            itemName: "Cáp 4x16",
            itemUnit: "m",
            perPanelQuantity: 2,
            demand: 2,
          },
        ],
      },
      {
        lineId: 2,
        tag: "DB-02",
        description: null,
        quantity: 1,
        bomLines: [
          {
            bomLineId: 13,
            itemId: 102,
            itemCode: "VT-Y",
            itemName: "Cáp 4x16",
            itemUnit: "m",
            perPanelQuantity: 2,
            demand: 2,
          },
        ],
      },
    ],
    unlinked: [],
    overBomIssues: [],
  };
}

const SCANS: Record<string, { id: number; code: string; name: string; unit: string }> =
  {
    "893-X": { id: 101, code: "VT-X", name: "Aptomat 3P", unit: "Cái" },
    "893-Y": { id: 102, code: "VT-Y", name: "Cáp 4x16", unit: "m" },
    "893-Z": { id: 103, code: "VT-Z", name: "Đầu cos", unit: "Cái" },
  };

beforeEach(() => {
  vi.clearAllMocks();
  apiGet.mockImplementation(
    (url: string, config?: { params?: { code?: string } }) => {
      if (url === "/inventory/materials/orders/4") {
        return Promise.resolve({ data: openOrder() });
      }
      if (url === "/items/resolve") {
        const item = SCANS[config?.params?.code ?? ""];
        return item
          ? Promise.resolve({ data: item })
          : Promise.reject({ isAxiosError: true, response: { status: 404 } });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    },
  );
});

afterEach(cleanup);

function renderScreen(screenNode: React.ReactNode) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, issue: viIssue }}
      >
        <NotificationProvider>{screenNode}</NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

async function scanField(): Promise<HTMLInputElement> {
  return (await screen.findByPlaceholderText(
    viIssue.scan.placeholder,
  )) as HTMLInputElement;
}

/** What a keyboard-wedge scanner does: types the code, then Enter. */
function scan(field: HTMLInputElement, code: string) {
  fireEvent.change(field, { target: { value: code } });
  fireEvent.keyDown(field, { key: "Enter" });
}

const fill = (template: string, code: string) =>
  template.replace("{code}", code);
const submitButton = () =>
  screen.getByRole("button", { name: viIssue.issueScreen.submit });

describe("IssueScreen", () => {
  it("keeps the focus on the scan field when a code is unknown", async () => {
    renderScreen(<IssueScreen />);
    const field = await scanField();

    scan(field, "NO-SUCH-CODE");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      viIssue.scan.notFound,
    );
    expect(field).toHaveFocus();
    expect(screen.getByText(viIssue.issueScreen.noLines)).toBeInTheDocument();
  });

  it("asks for a reason beyond the BOM and sends it", async () => {
    apiPost.mockResolvedValue({ data: { id: 7 } });
    renderScreen(<IssueScreen />);
    const field = await scanField();

    // X: 6 of 6 already out, one more goes beyond the BOM.
    scan(field, "893-X");
    expect(
      await screen.findByText(viIssue.lines.reasonRequired),
    ).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();

    fireEvent.change(
      screen.getByLabelText(fill(viIssue.lines.reasonOf, "VT-X")),
      { target: { value: "Hỏng khi lắp" } },
    );
    await waitFor(() => expect(submitButton()).toBeEnabled());
    fireEvent.click(submitButton());

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    const [url, body] = apiPost.mock.calls[0] as [
      string,
      { orderId: number; requestKey: string; lines: unknown[] },
    ];
    expect(url).toBe("/inventory/issues");
    expect(body.orderId).toBe(4);
    expect(body.requestKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.lines).toEqual([
      { itemId: 101, quantity: 1, reason: "Hỏng khi lắp" },
    ]);
  });

  it("adds a scan to the selected panel's line, or outside the BOM, and posts once", async () => {
    let answer!: (value: unknown) => void;
    apiPost.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    renderScreen(<IssueScreen />);
    const field = await scanField();

    fireEvent.click(screen.getByRole("button", { name: "DB-02" }));
    scan(field, "893-Y");
    await waitFor(() =>
      expect(
        (screen.getByLabelText(fill(viIssue.lines.quantityOf, "VT-Y")) as HTMLInputElement)
          .value,
      ).toBe("1"),
    );
    scan(field, "893-Y");
    await waitFor(() =>
      expect(
        (screen.getByLabelText(fill(viIssue.lines.quantityOf, "VT-Y")) as HTMLInputElement)
          .value,
      ).toBe("2"),
    );
    // Within its BOM: no reason asked.
    expect(screen.queryByText(viIssue.lines.reasonRequired)).not.toBeInTheDocument();

    fireEvent.click(submitButton());
    await waitFor(() => expect(submitButton()).toBeDisabled());
    fireEvent.click(submitButton());
    expect(apiPost).toHaveBeenCalledTimes(1);
    const [, body] = apiPost.mock.calls[0] as [string, { lines: unknown[] }];
    expect(body.lines).toEqual([{ itemId: 102, quantity: 2, orderLineId: 2 }]);

    answer({ data: { id: 8 } });
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/inventory/materials/4"),
    );
  });

  it("shows the selected panel's BOM and labels a line without a panel as the whole order", async () => {
    renderScreen(<IssueScreen />);
    const field = await scanField();

    scan(field, "893-Y");
    expect(await screen.findByText(viIssue.issueScreen.noPanel, { selector: "td *, td" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "MSB-01" }));
    expect(await screen.findByText(viIssue.lines.panelDemand)).toBeInTheDocument();
  });

  it("puts an item on no BOM of the order outside the BOM", async () => {
    renderScreen(<IssueScreen />);
    const field = await scanField();

    fireEvent.click(screen.getByRole("button", { name: "DB-02" }));
    scan(field, "893-Z");

    expect(
      await screen.findByText(viIssue.issueScreen.outsideBom),
    ).toBeInTheDocument();
    // Not on the BOM at all: beyond it from the first unit.
    expect(screen.getByText(viIssue.lines.reasonRequired)).toBeInTheDocument();
  });
});

describe("WorkshopReturnScreen", () => {
  it("lists what is out and refuses more than that", async () => {
    renderScreen(<WorkshopReturnScreen />);
    const quantity = (await screen.findByLabelText(
      fill(viIssue.lines.quantityOf, "VT-X"),
    )) as HTMLInputElement;
    // Y was never issued: nothing to return.
    expect(
      screen.queryByLabelText(fill(viIssue.lines.quantityOf, "VT-Y")),
    ).not.toBeInTheDocument();

    fireEvent.change(quantity, { target: { value: "7" } });
    expect(await screen.findByText(viIssue.lines.overOut)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: viIssue.returnScreen.submit }),
    ).toBeDisabled();
  });
});
