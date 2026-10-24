import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viCustomer from "@/kernel/langs/vi/customer.json";
import viModal from "@/kernel/langs/vi/modal.json";
import viProject from "@/kernel/langs/vi/project.json";

import { ProjectListPage } from "@plugins/crm/project/components/ProjectListPage";
import { ProjectPermission } from "@plugins/crm/project/permissions/project-permission.keys";

const apiGet = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);
const searchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({
    can,
    permissions: [...granted.value],
    user: { id: 11, role: "sales" },
    logout: vi.fn(),
  }),
  useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.value,
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/crm/projects",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const PROJECT = {
  id: 3,
  code: "DA_0003",
  customerId: 7,
  customerCode: "KH_0007",
  customerName: "Alpha Panels",
  name: "Tower A",
  siteAddress: "1 Site Road",
  note: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function respond() {
  apiGet.mockImplementation((url: string) => {
    if (url === "/projects") {
      return Promise.resolve({
        data: {
          data: [PROJECT],
          meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
        },
      });
    }
    if (url === "/projects/next-code") {
      return Promise.resolve({ data: { code: "DA_0004" } });
    }
    return Promise.resolve({ data: null });
  });
}

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
          customer: viCustomer,
          project: viProject,
          modal: viModal,
        }}
      >
        <NotificationProvider>
          <ProjectListPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function grant(...permissions: string[]) {
  granted.value = new Set(permissions);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  searchParams.value = new URLSearchParams();
  grant(ProjectPermission.read);
  respond();
});

afterEach(cleanup);

describe("ProjectListPage", () => {
  it("lists the projects the API returns, with their customer", async () => {
    renderPage();

    expect(await screen.findByText("DA_0003")).toBeInTheDocument();
    expect(screen.getByText("Tower A")).toBeInTheDocument();
    expect(screen.getByText("KH_0007 — Alpha Panels")).toBeInTheDocument();
  });

  it("hides the create button from an actor without project:create", async () => {
    grant(ProjectPermission.read);
    renderPage();
    await screen.findByText("DA_0003");

    expect(screen.queryByText(viProject.addButton)).not.toBeInTheDocument();
  });

  it("shows the create button to an actor holding project:create", async () => {
    grant(ProjectPermission.read, ProjectPermission.create);
    renderPage();
    await screen.findByText("DA_0003");

    expect(screen.getByText(viProject.addButton)).toBeInTheDocument();
  });

  it("offers the row edit and delete controls only with project:update and project:delete", async () => {
    grant(ProjectPermission.read);
    const { unmount } = renderPage();
    await screen.findByText("DA_0003");
    expect(screen.queryByTitle(viCommon.edit)).not.toBeInTheDocument();
    expect(screen.queryByTitle(viCommon.delete)).not.toBeInTheDocument();
    unmount();

    grant(
      ProjectPermission.read,
      ProjectPermission.update,
      ProjectPermission.delete,
    );
    renderPage();
    await screen.findByText("DA_0003");
    expect(screen.getByTitle(viCommon.edit)).toBeInTheDocument();
    expect(screen.getByTitle(viCommon.delete)).toBeInTheDocument();
  });

  it("never asks for the next code while the create modal is closed", async () => {
    grant(ProjectPermission.read, ProjectPermission.create);
    renderPage();
    await screen.findByText("DA_0003");

    const urls = apiGet.mock.calls.map((call) => call[0] as string);
    expect(urls).not.toContain("/projects/next-code");
  });
});
