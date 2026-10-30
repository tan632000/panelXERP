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
import viModal from "@/kernel/langs/vi/modal.json";
import viStocktake from "@/kernel/langs/vi/stocktake.json";

import { StocktakeDetailPage } from "@plugins/inventory/stocktake/components/StocktakeDetailPage";
import { StocktakePermission } from "@plugins/inventory/stocktake/permissions/stocktake-permission.keys";

import type { StocktakeDetail } from "@plugins/inventory/stocktake/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const apiPatch = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const actorUser = vi.hoisted(() => ({
  value: { id: 40, role: "storekeeper" },
}));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: apiPatch, delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => {
  const can = (permission: string) => granted.value.has(permission);
  return {
    useAuth: () => ({
      can,
      permissions: [...granted.value],
      user: actorUser.value,
      logout: vi.fn(),
    }),
    useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "7" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/inventory/stocktakes/7",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const STOREKEEPER_ID = 40;
const DIRECTOR_ID = 60;

/** The count as a storekeeper reads it: book and difference, never a cost. */
function count(overrides: Partial<StocktakeDetail> = {}): StocktakeDetail {
  return {
    id: 7,
    code: "KK_2026_0003",
    scope: "all",
    locationId: null,
    locationCode: null,
    status: "counting",
    note: null,
    lineCount: 2,
    countedCount: 1,
    createdBy: STOREKEEPER_ID,
    createdByName: "Thủ kho",
    createdAt: "2026-10-29T08:00:00.000Z",
    submittedAt: null,
    approvedAt: null,
    rejectReason: null,
    cancelReason: null,
    submittedBy: null,
    approvedBy: null,
    involvedUserIds: [STOREKEEPER_ID],
    lines: [
      {
        id: 1,
        itemId: 101,
        itemCode: "VT-B",
        itemName: "Aptomat 3P",
        itemUnit: "Cái",
        countedQty: 9,
        bookQty: 10,
        diff: -1,
        countedAt: "2026-10-29T08:10:00.000Z",
      },
      {
        id: 2,
        itemId: 102,
        itemCode: "VT-D",
        itemName: "Cáp 4x16",
        itemUnit: "m",
        countedQty: null,
        bookQty: null,
        diff: null,
        countedAt: null,
      },
    ],
    ...overrides,
  };
}

function respond(detail: StocktakeDetail) {
  apiGet.mockImplementation((url: string) =>
    url === "/inventory/stocktakes/7"
      ? Promise.resolve({ data: detail })
      : Promise.reject(new Error(`Unexpected GET ${url}`)),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actorUser.value = { id: STOREKEEPER_ID, role: "storekeeper" };
  granted.value = new Set([
    StocktakePermission.read,
    StocktakePermission.update,
    StocktakePermission.submit,
    StocktakePermission.cancel,
  ]);
});

afterEach(cleanup);

function renderPage() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, modal: viModal, stocktake: viStocktake }}
      >
        <NotificationProvider>
          <StocktakeDetailPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** What a keyboard-wedge scanner does: types the code, then Enter. */
function scan(field: HTMLInputElement, code: string) {
  fireEvent.change(field, { target: { value: code } });
  fireEvent.keyDown(field, { key: "Enter" });
}

const countedOf = (code: string) =>
  screen.getByLabelText(
    viStocktake.lines.countedOf.replace("{code}", code),
  ) as HTMLInputElement;

describe("StocktakeDetailPage — counting", () => {
  it("shows the book next to the counted quantity and the difference, never a value", async () => {
    respond(count());
    renderPage();

    expect(await screen.findByText(viStocktake.lines.book)).toBeInTheDocument();
    expect(countedOf("VT-B").value).toBe("9");
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("-1")).toBeInTheDocument();
    expect(screen.queryByText(viStocktake.lines.value)).not.toBeInTheDocument();
  });

  it("adds a scanned item through the scan endpoint and shows the answer", async () => {
    respond(count());
    const scanned = count({
      countedCount: 2,
      lines: [
        count().lines[0],
        { ...count().lines[1], countedQty: 1, bookQty: 5, diff: -4 },
      ],
    });
    // The server stores the scan: a later read answers the counted line too.
    apiPost.mockImplementation(() => {
      respond(scanned);
      return Promise.resolve({ data: scanned });
    });
    renderPage();
    const field = (await screen.findByPlaceholderText(
      viStocktake.scan.placeholder,
    )) as HTMLInputElement;

    scan(field, "8930102");

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/inventory/stocktakes/7/scan", {
        code: "8930102",
      }),
    );
    await waitFor(() => expect(countedOf("VT-D").value).toBe("1"));
    expect(field).toHaveFocus();
  });

  it("keeps the focus and says so when a scanned code is unknown", async () => {
    respond(count());
    apiPost.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404 },
    });
    renderPage();
    const field = (await screen.findByPlaceholderText(
      viStocktake.scan.placeholder,
    )) as HTMLInputElement;

    scan(field, "NO-SUCH");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      viStocktake.scan.notFound,
    );
    expect(field).toHaveFocus();
  });

  it("saves a typed counted quantity when the field is left", async () => {
    respond(count());
    apiPatch.mockResolvedValue({ data: count() });
    renderPage();
    await screen.findByText(viStocktake.lines.book);

    fireEvent.change(countedOf("VT-D"), { target: { value: "5" } });
    fireEvent.blur(countedOf("VT-D"));

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith(
        "/inventory/stocktakes/7/lines/102",
        { countedQty: 5 },
      ),
    );
  });
});

describe("StocktakeDetailPage — recounting", () => {
  it("saves the same quantity again: a recount records today's book", async () => {
    respond(count());
    apiPatch.mockResolvedValue({ data: count() });
    renderPage();
    await screen.findByText(viStocktake.lines.book);

    // VT-B already reads 9; clearing it and typing 9 again is a recount, not a no-op.
    fireEvent.change(countedOf("VT-B"), { target: { value: "" } });
    fireEvent.change(countedOf("VT-B"), { target: { value: "9" } });
    fireEvent.keyDown(countedOf("VT-B"), { key: "Enter" });
    fireEvent.blur(countedOf("VT-B"));

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith(
        "/inventory/stocktakes/7/lines/101",
        { countedQty: 9 },
      ),
    );
    // Enter then leaving the field saves once.
    expect(apiPatch).toHaveBeenCalledTimes(1);
  });
});

describe("StocktakeDetailPage — approval", () => {
  const submitted = (involved: number[]) =>
    count({ status: "submitted", involvedUserIds: involved });

  it("offers approve and reject to a director who took no part", async () => {
    actorUser.value = { id: DIRECTOR_ID, role: "director" };
    granted.value = new Set([
      StocktakePermission.read,
      StocktakePermission.approve,
    ]);
    respond(submitted([STOREKEEPER_ID]));
    renderPage();

    expect(
      await screen.findByRole("button", { name: viStocktake.actions.approve }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: viStocktake.actions.reject }),
    ).toBeInTheDocument();
    // Submitted: no more counting.
    expect(
      screen.queryByPlaceholderText(viStocktake.scan.placeholder),
    ).not.toBeInTheDocument();
  });

  it("withholds the decision from a director who counted", async () => {
    actorUser.value = { id: DIRECTOR_ID, role: "director" };
    granted.value = new Set([
      StocktakePermission.read,
      StocktakePermission.approve,
    ]);
    respond(submitted([STOREKEEPER_ID, DIRECTOR_ID]));
    renderPage();

    expect(
      await screen.findByText(viStocktake.involvedCannotDecide),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: viStocktake.actions.approve }),
    ).not.toBeInTheDocument();
  });

  it.each(["approved", "cancelled"] as const)(
    "drops the empty actions heading once the count is %s",
    async (status) => {
      respond(count({ status }));
      renderPage();

      expect(
        await screen.findByText(viStocktake.lines.title),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(viStocktake.actions.title),
      ).not.toBeInTheDocument();
    },
  );
});
