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

import { IssueListPage } from "@plugins/production/production-issue/components/IssueListPage";
import { UnitIssuesSection } from "@plugins/production/production-issue/components/UnitIssuesSection";
import { ProductionIssuePermission } from "@plugins/production/production-issue/permissions/production-issue-permission.keys";

import type { ProductionIssue } from "@plugins/production/production-issue/types";

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
  usePathname: () => "/production/issues",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function issue(overrides: Partial<ProductionIssue> = {}): ProductionIssue {
  return {
    id: 7,
    unitId: 5,
    unitCode: "MSB-01-1",
    productionOrderId: 3,
    productionOrderCode: "LSX_2026_0003",
    stage: "wiring",
    description: "Thiếu đầu cos",
    severity: "high",
    status: "open",
    reportedBy: 61,
    reportedByName: "Kỹ thuật A",
    createdAt: "2026-11-02T01:00:00.000Z",
    resolvedBy: null,
    resolvedByName: null,
    resolvedAt: null,
    resolution: null,
    ...overrides,
  };
}

function page(rows: ProductionIssue[]) {
  apiGet.mockResolvedValue({
    data: { data: rows, meta: { total: rows.length, totalPages: 1 } },
  });
}

function renderPage(node: React.ReactNode) {
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
        <NotificationProvider>{node}</NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const TECHNICIAN = [
  ProductionIssuePermission.read,
  ProductionIssuePermission.create,
];
const MANAGER = [...TECHNICIAN, ProductionIssuePermission.resolve];

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set(MANAGER);
  page([issue()]);
});

afterEach(cleanup);

describe("IssueListPage", () => {
  it("lists the issues with their stage, severity, reporter and status", async () => {
    renderPage(<IssueListPage />);

    await screen.findByText("Thiếu đầu cos");
    expect(apiGet).toHaveBeenCalledWith("/production/issues", {
      params: expect.objectContaining({ status: undefined }),
    });
    expect(screen.getByText("MSB-01-1")).toBeInTheDocument();
    expect(screen.getByText(viProduction.stages.wiring)).toBeInTheDocument();
    expect(
      screen.getByText(viProduction.issues.severities.high),
    ).toBeInTheDocument();
    expect(screen.getByText("Kỹ thuật A")).toBeInTheDocument();
    expect(
      screen.getByText(viProduction.issues.statuses.open),
    ).toBeInTheDocument();
  });

  it("says so when there is no issue", async () => {
    page([]);
    renderPage(<IssueListPage />);

    expect(
      await screen.findByText(viProduction.issues.none),
    ).toBeInTheDocument();
  });

  it("resolves an open issue with the resolution typed", async () => {
    apiPost.mockResolvedValue({
      data: issue({ status: "resolved", resolution: "Đã bổ sung" }),
    });
    renderPage(<IssueListPage />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: viProduction.issues.resolveButton,
      }),
    );
    const resolution = await screen.findByPlaceholderText(
      viProduction.issues.resolve.placeholder,
    );
    const dialog = resolution.closest("form") as HTMLElement;
    fireEvent.change(resolution, { target: { value: "Đã bổ sung" } });
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: viProduction.issues.resolve.submit,
      }),
    );

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/production/issues/7/resolve", {
        resolution: "Đã bổ sung",
      }),
    );
  });

  it("offers no resolve to a technician, nor on a resolved issue", async () => {
    granted.value = new Set(TECHNICIAN);
    renderPage(<IssueListPage />);
    await screen.findByText("Thiếu đầu cos");
    expect(
      screen.queryByRole("button", { name: viProduction.issues.resolveButton }),
    ).toBeNull();
    cleanup();

    granted.value = new Set(MANAGER);
    page([issue({ status: "resolved", resolution: "Xong" })]);
    renderPage(<IssueListPage />);
    await screen.findByText(viProduction.issues.statuses.resolved);
    expect(
      screen.queryByRole("button", { name: viProduction.issues.resolveButton }),
    ).toBeNull();
  });
});

describe("UnitIssuesSection", () => {
  const unit = { id: 5, code: "MSB-01-1" };
  const section = (canReport = true) => (
    <UnitIssuesSection
      unit={unit}
      currentStage="wiring"
      canReport={canReport}
    />
  );

  it("asks for the issues of the cabinet only", async () => {
    renderPage(section());

    await screen.findByText("Thiếu đầu cos");
    expect(apiGet).toHaveBeenCalledWith("/production/issues", {
      params: expect.objectContaining({ unitId: 5 }),
    });
  });

  it("reports an issue on the stage being worked, with the description typed", async () => {
    granted.value = new Set(TECHNICIAN);
    apiPost.mockResolvedValue({ data: issue({ id: 8 }) });
    renderPage(section());

    fireEvent.click(
      await screen.findByRole("button", { name: viProduction.issues.report }),
    );
    const description = await screen.findByPlaceholderText(
      viProduction.issues.form.placeholder,
    );
    const dialog = description.closest("form") as HTMLElement;
    const submit = within(dialog).getByRole("button", {
      name: viProduction.issues.form.submit,
    });
    expect(submit).toBeDisabled();
    fireEvent.change(description, { target: { value: "  Hỏng cầu đấu  " } });
    fireEvent.click(submit);

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/production/units/5/issues", {
        stage: "wiring",
        severity: "medium",
        description: "Hỏng cầu đấu",
      }),
    );
  });

  it("offers no report once the order is not released, nor without the right", async () => {
    renderPage(section(false));
    await screen.findByText("Thiếu đầu cos");
    expect(
      screen.queryByRole("button", { name: viProduction.issues.report }),
    ).toBeNull();
    cleanup();

    granted.value = new Set([ProductionIssuePermission.read]);
    renderPage(section());
    await screen.findByText("Thiếu đầu cos");
    expect(
      screen.queryByRole("button", { name: viProduction.issues.report }),
    ).toBeNull();
  });
});
