import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viIssue from "@/kernel/langs/vi/issue.json";

import { WorkshopReturnScreen } from "@plugins/inventory/issue/components/WorkshopReturnScreen";

const apiGet = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/inventory/issues/return",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

/** An order with 6 of VT-X still out at the workshop. */
const orderWith = (status: string) => ({
  order: {
    id: 4,
    code: "DH_2026_0004",
    status,
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
  ],
  panels: [],
  unlinked: [],
  overBomIssues: [],
});

function renderScreen(status: string) {
  apiGet.mockImplementation((url: string) =>
    url === "/inventory/materials/orders/4"
      ? Promise.resolve({ data: orderWith(status) })
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
        messages={{ common: viCommon, issue: viIssue }}
      >
        <NotificationProvider>
          <WorkshopReturnScreen />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const refusal = viIssue.returnScreen.notReturnable.replace(
  "{code}",
  "DH_2026_0004",
);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("WorkshopReturnScreen by order status", () => {
  it.each(["open", "in_production", "cancelled"])(
    "renders the return form for a %s order",
    async (status) => {
      renderScreen(status);

      expect(
        await screen.findByLabelText(
          viIssue.lines.quantityOf.replace("{code}", "VT-X"),
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(refusal)).not.toBeInTheDocument();
    },
  );

  it("refuses a delivered order", async () => {
    renderScreen("delivered");

    expect(await screen.findByText(refusal)).toBeInTheDocument();
  });
});
