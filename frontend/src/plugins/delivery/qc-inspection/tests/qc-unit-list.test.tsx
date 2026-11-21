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
import viDelivery from "@/kernel/langs/vi/delivery.json";
import viModal from "@/kernel/langs/vi/modal.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { QcUnitListPage } from "@plugins/delivery/qc-inspection/components/QcUnitListPage";
import { QcUnitPage } from "@plugins/delivery/qc-inspection/components/QcUnitPage";

import type {
  QcDefect,
  QcUnitDetail,
  QcUnitSummary,
} from "@plugins/delivery/qc-inspection/types";

const apiGet = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn(), put: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => {
  const can = (permission: string) => granted.value.has(permission);
  return {
    useAuth: () => ({
      can,
      permissions: [...granted.value],
      user: { id: 7, role: "qcInspector" },
      logout: vi.fn(),
    }),
    useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
  };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ unitId: "5" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/delivery/qc",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const ITEMS = [
  { id: 11, name: "Vỏ tủ, sơn và cánh cửa", position: 1, active: true },
];

function summary(overrides: Partial<QcUnitSummary> = {}): QcUnitSummary {
  return {
    unitId: 5,
    code: "MSB-01-1",
    tag: "MSB-01",
    description: null,
    productionOrderId: 3,
    productionOrderCode: "LSX_2026_0003",
    orderId: 9,
    orderCode: "DH_2026_0009",
    customerName: "Công ty Điện Nam",
    qcStatus: "waiting",
    ...overrides,
  };
}

function defect(status: QcDefect["status"]): QcDefect {
  return {
    id: 1,
    unitId: 5,
    unitCode: "MSB-01-1",
    roundNo: 1,
    description: "Sơn xước cánh cửa",
    status,
    fixNote: null,
    fixedBy: null,
    fixedByName: null,
    fixedAt: null,
    verifiedBy: null,
    verifiedByName: null,
    verifiedAt: null,
  };
}

function detail(overrides: Partial<QcUnitDetail> = {}): QcUnitDetail {
  return { ...summary(), rounds: [], defects: [], ...overrides };
}

function show(unit: QcUnitDetail) {
  apiGet.mockImplementation((url: string) => {
    if (url === "/delivery/qc/checklist-items") {
      return Promise.resolve({ data: ITEMS });
    }
    if (url === "/delivery/qc/units/5") return Promise.resolve({ data: unit });
    return Promise.resolve({
      data: {
        data: [summary(), summary({ unitId: 6, code: "MSB-01-2" })],
        meta: { total: 2, totalPages: 1 },
      },
    });
  });
}

function renderPage(page: React.ReactNode) {
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
          delivery: viDelivery,
          modal: viModal,
          status: viStatus,
        }}
      >
        <NotificationProvider>{page}</NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set(["qc_inspection:read", "qc_checklist:read"]);
  URL.createObjectURL = vi.fn(() => "blob:photo");
  URL.revokeObjectURL = vi.fn();
  show(detail());
});

afterEach(cleanup);

describe("QcUnitListPage", () => {
  it("lists the cabinets with their QC status", async () => {
    renderPage(<QcUnitListPage />);

    await screen.findByText("MSB-01-2");
    expect(screen.getAllByText(viDelivery.qc.statuses.waiting).length).toBe(2);
    expect(apiGet).toHaveBeenCalledWith("/delivery/qc/units", {
      params: expect.objectContaining({ page: 1 }),
    });
  });

  it("sends the QC status chosen in the filter", async () => {
    renderPage(<QcUnitListPage />);
    await screen.findByText("MSB-01-2");

    fireEvent.mouseDown(screen.getByPlaceholderText(viDelivery.qc.allStatuses));
    fireEvent.mouseDown(
      screen.getByRole("option", { name: viDelivery.qc.statuses.failed }),
    );

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith("/delivery/qc/units", {
        params: expect.objectContaining({ qcStatus: "failed" }),
      }),
    );
  });
});

describe("QcUnitPage: who may record a round", () => {
  const form = () => screen.queryByText(viDelivery.qc.form.title);

  it("shows the form to a QC inspector on a waiting cabinet with no open defect", async () => {
    granted.value.add("qc_inspection:create");
    renderPage(<QcUnitPage />);

    expect(await screen.findByText(viDelivery.qc.form.title)).toBeTruthy();
  });

  it("hides the form without qc_inspection:create", async () => {
    renderPage(<QcUnitPage />);

    await screen.findByText(viDelivery.qc.unit.noRounds);
    expect(form()).toBeNull();
  });

  it("hides the form on a passed cabinet", async () => {
    granted.value.add("qc_inspection:create");
    show(detail({ qcStatus: "passed" }));
    renderPage(<QcUnitPage />);

    await screen.findByText(viDelivery.qc.unit.noRounds);
    expect(form()).toBeNull();
  });

  it.each(["open", "fixed"] as const)(
    "hides the form while a defect is %s, and says why",
    async (status) => {
      granted.value.add("qc_inspection:create");
      show(detail({ qcStatus: "failed", defects: [defect(status)] }));
      renderPage(<QcUnitPage />);

      await screen.findByText(viDelivery.qc.unit.defectsBlock);
      expect(form()).toBeNull();
    },
  );

  it("shows the form on a failed cabinet once every defect is verified", async () => {
    granted.value.add("qc_inspection:create");
    show(detail({ qcStatus: "failed", defects: [defect("verified")] }));
    renderPage(<QcUnitPage />);

    expect(await screen.findByText(viDelivery.qc.form.title)).toBeTruthy();
  });

  it("shows a hint instead of the form when the active template is empty", async () => {
    granted.value.add("qc_inspection:create");
    apiGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: url === "/delivery/qc/checklist-items" ? [] : detail(),
      }),
    );
    renderPage(<QcUnitPage />);

    expect(await screen.findByText(viDelivery.qc.form.noTemplate)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: viDelivery.qc.form.submit }),
    ).toBeNull();
  });
});
