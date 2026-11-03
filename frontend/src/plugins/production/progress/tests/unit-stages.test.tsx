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
import viModal from "@/kernel/langs/vi/modal.json";
import viProduction from "@/kernel/langs/vi/production.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { ProductionIssuePermission } from "@plugins/production/production-issue/permissions/production-issue-permission.keys";
import { MyUnitsPage } from "@plugins/production/progress/components/MyUnitsPage";
import { UnitDetailPage } from "@plugins/production/progress/components/UnitDetailPage";
import {
  PRODUCTION_STAGES,
  type StageStatus,
} from "@plugins/production/progress/constants";
import { ProductionProgressPermission } from "@plugins/production/progress/permissions/progress-permission.keys";

import type { UnitProgress } from "@plugins/production/progress/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => {
  const can = (permission: string) => granted.value.has(permission);
  return {
    useAuth: () => ({
      can,
      permissions: [...granted.value],
      user: { id: 61, role: "technician" },
      logout: vi.fn(),
    }),
    useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "5" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/production/units/5",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

/** A cabinet whose first `done` stages are done and the next one has the given status. */
function unit(
  done: number,
  next: StageStatus = "pending",
  overrides: Partial<UnitProgress> = {},
): UnitProgress {
  const stages = PRODUCTION_STAGES.map((stage, index) => {
    let status: StageStatus = "pending";
    if (index < done) status = "done";
    else if (index === done) status = next;
    return {
      stage,
      seq: index + 1,
      status,
      startedAt: status === "pending" ? null : "2026-11-02T01:00:00.000Z",
      startedByName: status === "pending" ? null : "Kỹ thuật A",
      doneAt: status === "done" ? "2026-11-02T02:00:00.000Z" : null,
      doneByName: status === "done" ? "Kỹ thuật A" : null,
    };
  });
  return {
    id: 5,
    code: "MSB-01-1",
    tag: "MSB-01",
    description: "Main switchboard",
    productionOrderId: 3,
    productionOrderCode: "LSX_2026_0003",
    productionOrderStatus: "released",
    assigneeId: 61,
    assigneeName: "Kỹ thuật A",
    plannedEndDate: "2026-11-20",
    stages,
    doneCount: done,
    currentStage: PRODUCTION_STAGES[done] ?? null,
    ...overrides,
  };
}

function renderPage(page: React.ReactNode = <UnitDetailPage />) {
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
          production: viProduction,
          status: viStatus,
        }}
      >
        <NotificationProvider>{page}</NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const TECHNICIAN = [
  ProductionProgressPermission.read,
  ProductionProgressPermission.update,
];
const MANAGER = [...TECHNICIAN, ProductionProgressPermission.undo];

const stageRow = (stage: (typeof PRODUCTION_STAGES)[number]) =>
  screen.getByRole("listitem", { name: viProduction.stages[stage] });
const buttonsIn = (row: HTMLElement) =>
  within(row)
    .queryAllByRole("button")
    .map((button) => button.textContent);

const stageControls = () =>
  PRODUCTION_STAGES.flatMap((stage) => buttonsIn(stageRow(stage)));

function show(detail: UnitProgress) {
  // The photo and issue sections of the page read their own routes: none of either yet.
  apiGet.mockImplementation((url: string) => {
    if (url.endsWith("/photos")) return Promise.resolve({ data: [] });
    if (url === "/production/issues") {
      return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
    }
    return Promise.resolve({ data: detail });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set(TECHNICIAN);
  show(unit(1, "pending"));
});

afterEach(cleanup);

describe("UnitDetailPage stages", () => {
  it("offers Start on the first stage after the last done one, and nothing further down", async () => {
    apiPost.mockResolvedValue({ data: unit(1, "in_progress") });
    renderPage();

    await screen.findByText("1/6", { exact: false });
    expect(buttonsIn(stageRow("material_prep"))).toEqual([]);
    expect(buttonsIn(stageRow("enclosure"))).toEqual([
      viProduction.stageActions.start,
    ]);
    expect(buttonsIn(stageRow("device_mounting"))).toEqual([]);

    fireEvent.click(
      within(stageRow("enclosure")).getByRole("button", {
        name: viProduction.stageActions.start,
      }),
    );
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        "/production/units/5/stages/enclosure/start",
        {},
      ),
    );
  });

  it("offers Finish on the stage in progress", async () => {
    show(unit(1, "in_progress"));
    apiPost.mockResolvedValue({ data: unit(2, "pending") });
    renderPage();

    await screen.findByText(viProduction.stageStatuses.in_progress);
    expect(buttonsIn(stageRow("enclosure"))).toEqual([
      viProduction.stageActions.finish,
    ]);
    fireEvent.click(
      within(stageRow("enclosure")).getByRole("button", {
        name: viProduction.stageActions.finish,
      }),
    );
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        "/production/units/5/stages/enclosure/finish",
        {},
      ),
    );
  });

  it("gives a technician no undo, and a manager one only on the latest done stage", async () => {
    show(unit(2, "pending"));
    renderPage();
    await screen.findByText(viProduction.stages.enclosure);
    expect(screen.queryByText(viProduction.stageActions.undo)).toBeNull();
    cleanup();

    granted.value = new Set(MANAGER);
    renderPage();
    await screen.findAllByText(viProduction.stages.enclosure);
    expect(buttonsIn(stageRow("material_prep"))).toEqual([]);
    expect(buttonsIn(stageRow("enclosure"))).toEqual([
      viProduction.stageActions.undo,
    ]);
  });

  it("undoes with the reason typed", async () => {
    granted.value = new Set(MANAGER);
    show(unit(2, "pending"));
    apiPost.mockResolvedValue({ data: unit(1, "in_progress") });
    renderPage();

    fireEvent.click(
      await within(
        await screen.findByRole("listitem", {
          name: viProduction.stages.enclosure,
        }),
      ).findByRole("button", { name: viProduction.stageActions.undo }),
    );
    const reason = await screen.findByPlaceholderText(
      viProduction.undo.placeholder,
    );
    const dialog = reason.closest("form") as HTMLElement;
    fireEvent.change(reason, { target: { value: "Thiếu aptomat" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: viProduction.undo.submit }),
    );

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith(
        "/production/units/5/stages/enclosure/undo",
        { reason: "Thiếu aptomat" },
      ),
    );
  });

  it("shows no control to a reader, nor once the production order is no longer released", async () => {
    granted.value = new Set([ProductionProgressPermission.read]);
    renderPage();
    await screen.findByRole("listitem", {
      name: viProduction.stages.enclosure,
    });
    expect(stageControls()).toEqual([]);
    cleanup();

    granted.value = new Set(MANAGER);
    show(unit(6, "done", { productionOrderStatus: "completed" }));
    renderPage();
    await screen.findByText(viProduction.stageDone);
    expect(stageControls()).toEqual([]);
  });
});

describe("UnitDetailPage issues", () => {
  const issueCalls = () =>
    apiGet.mock.calls.filter(([url]) => url === "/production/issues");

  it("asks for a cabinet's issues only from whoever may read them", async () => {
    // Sales follow progress but hold no issue scope: the API would answer 403.
    granted.value = new Set([ProductionProgressPermission.read]);
    renderPage();
    await screen.findByText(viProduction.stagesTitle);

    expect(screen.queryByText(viProduction.issues.title)).toBeNull();
    expect(issueCalls()).toEqual([]);
  });

  it("lists the issues of the cabinet to a holder of the issue scope", async () => {
    granted.value = new Set([
      ...TECHNICIAN,
      ProductionIssuePermission.read,
      ProductionIssuePermission.create,
    ]);
    renderPage();

    expect(
      await screen.findByText(viProduction.issues.title),
    ).toBeInTheDocument();
    await waitFor(() => expect(issueCalls()).not.toEqual([]));
  });
});

describe("UnitDetailPage breadcrumb", () => {
  it("takes a reader back to the production order, not to a cabinet list they cannot open", async () => {
    granted.value = new Set([ProductionProgressPermission.read]);
    renderPage();

    const crumb = await screen.findByRole("link", {
      name: "LSX_2026_0003",
    });
    expect(crumb).toHaveAttribute("href", "/production/orders/3");
    expect(
      screen.queryByRole("link", { name: viProduction.myUnits }),
    ).toBeNull();
  });

  it("takes a technician back to their own cabinets", async () => {
    renderPage();

    expect(
      await screen.findByRole("link", { name: viProduction.myUnits }),
    ).toHaveAttribute("href", "/production/my-units");
  });
});

describe("MyUnitsPage", () => {
  const page = (rows: UnitProgress[]) =>
    apiGet.mockResolvedValue({
      data: { data: rows, meta: { total: rows.length, totalPages: 1 } },
    });

  it("lists only a technician's own cabinets", async () => {
    page([unit(1, "pending")]);
    renderPage(<MyUnitsPage />);

    expect(await screen.findByText(viProduction.myUnits)).toBeInTheDocument();
    await screen.findByText("MSB-01-1");
    expect(apiGet).toHaveBeenCalledWith("/production/units", {
      params: expect.objectContaining({ mine: true }),
    });
    expect(
      screen.queryByPlaceholderText(viProduction.allStageStatuses),
    ).toBeNull();
  });

  it("lists every cabinet in scope, with its technician, to whoever runs the workshop", async () => {
    granted.value = new Set(MANAGER);
    page([
      unit(1, "pending"),
      unit(3, "in_progress", {
        id: 6,
        code: "MSB-02-1",
        assigneeName: "Kỹ thuật B",
      }),
    ]);
    renderPage(<MyUnitsPage />);

    expect(
      await screen.findByText(viProduction.workshopUnits),
    ).toBeInTheDocument();
    await screen.findByText("MSB-02-1");
    expect(screen.getByText("Kỹ thuật B")).toBeInTheDocument();
    const params = apiGet.mock.calls[0][1].params;
    expect(params.mine).toBeUndefined();
    expect(
      screen.getByPlaceholderText(viProduction.allStageStatuses),
    ).toBeInTheDocument();
  });
});
