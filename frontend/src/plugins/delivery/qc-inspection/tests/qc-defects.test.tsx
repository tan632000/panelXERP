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
import viDelivery from "@/kernel/langs/vi/delivery.json";
import viModal from "@/kernel/langs/vi/modal.json";
import viStatus from "@/kernel/langs/vi/status.json";

import { QcDefectsPage } from "@plugins/delivery/qc-inspection/components/QcDefectsPage";

import type { QcDefect } from "@plugins/delivery/qc-inspection/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: vi.fn(), put: vi.fn() },
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
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/delivery/qc/defects",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

/** The signed-in user is id 7: a fixed defect of id 7 is theirs, one of id 99 someone else's. */
function defect(id: number, overrides: Partial<QcDefect>): QcDefect {
  return {
    id,
    unitId: 5,
    unitCode: `MSB-01-${id}`,
    roundNo: 1,
    description: `Lỗi số ${id}`,
    status: "open",
    fixNote: null,
    fixedBy: null,
    fixedByName: null,
    fixedAt: null,
    verifiedBy: null,
    verifiedByName: null,
    verifiedAt: null,
    ...overrides,
  };
}

const DEFECTS = [
  defect(1, {}),
  defect(2, { status: "fixed", fixedBy: 99, fixNote: "Sơn lại" }),
  defect(3, { status: "fixed", fixedBy: 7, fixNote: "Siết lại" }),
  defect(4, { status: "verified", fixedBy: 99, verifiedBy: 7 }),
];

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
          delivery: viDelivery,
          modal: viModal,
          status: viStatus,
        }}
      >
        <NotificationProvider>
          <QcDefectsPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const rowOf = (description: string) =>
  screen.getByText(description).closest("tr") as HTMLElement;
const fixButton = (row: HTMLElement) =>
  within(row).queryByRole("button", { name: viDelivery.qc.defects.fix });
const verifyButton = (row: HTMLElement) =>
  within(row).queryByRole("button", { name: viDelivery.qc.defects.verify });

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set(["qc_inspection:read"]);
  apiGet.mockResolvedValue({
    data: { data: DEFECTS, meta: { total: 4, totalPages: 1 } },
  });
});

afterEach(cleanup);

describe("QcDefectsPage", () => {
  it("lists the defects with their status", async () => {
    renderPage();

    await screen.findByText("Lỗi số 1");
    expect(screen.getByText(viDelivery.qc.defectStatuses.open)).toBeTruthy();
    expect(screen.getByText(viDelivery.qc.defectStatuses.verified)).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith("/delivery/qc/defects", {
      params: expect.objectContaining({ page: 1 }),
    });
  });

  it("offers no action to a reader without fix or verify", async () => {
    renderPage();

    await screen.findByText("Lỗi số 1");
    expect(
      screen.queryByRole("button", { name: viDelivery.qc.defects.fix }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: viDelivery.qc.defects.verify }),
    ).toBeNull();
  });

  it("offers 'fixed' only with qc_inspection:fix and only on an open defect", async () => {
    granted.value.add("qc_inspection:fix");
    renderPage();

    await screen.findByText("Lỗi số 1");
    expect(fixButton(rowOf("Lỗi số 1"))).not.toBeNull();
    for (const other of ["Lỗi số 2", "Lỗi số 3", "Lỗi số 4"]) {
      expect(fixButton(rowOf(other))).toBeNull();
    }
  });

  it("marks a defect fixed with the note that was typed", async () => {
    granted.value.add("qc_inspection:fix");
    apiPost.mockResolvedValue({ data: DEFECTS[0] });
    renderPage();
    await screen.findByText("Lỗi số 1");

    fireEvent.click(fixButton(rowOf("Lỗi số 1")) as HTMLElement);
    fireEvent.change(
      await screen.findByPlaceholderText(viDelivery.qc.defects.fixPlaceholder),
      { target: { value: "  Sơn lại cánh cửa  " } },
    );
    // The dialog's own button comes after the row's.
    const buttons = screen.getAllByRole("button", {
      name: viDelivery.qc.defects.fix,
    });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/delivery/qc/defects/1/fix", {
      note: "Sơn lại cánh cửa",
    });
  });

  it("offers 'verify' only with qc_inspection:verify, only on a fixed defect, never to the one who fixed it", async () => {
    granted.value.add("qc_inspection:verify");
    renderPage();

    await screen.findByText("Lỗi số 1");
    expect(verifyButton(rowOf("Lỗi số 2"))).not.toBeNull();
    // Fixed by the signed-in user (id 7), open and verified ones.
    for (const other of ["Lỗi số 1", "Lỗi số 3", "Lỗi số 4"]) {
      expect(verifyButton(rowOf(other))).toBeNull();
    }
  });

  it("verifies a defect fixed by someone else", async () => {
    granted.value.add("qc_inspection:verify");
    apiPost.mockResolvedValue({ data: DEFECTS[1] });
    renderPage();
    await screen.findByText("Lỗi số 2");

    fireEvent.click(verifyButton(rowOf("Lỗi số 2")) as HTMLElement);

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/delivery/qc/defects/2/verify", {});
  });
});
