import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viAuth from "@/kernel/langs/vi/auth.json";
import viCommon from "@/kernel/langs/vi/common.json";
import viPermission from "@/kernel/langs/vi/permission.json";
import viSystem from "@/kernel/langs/vi/system.json";

import { RoleListPage } from "@plugins/system/roles/components/RoleListPage";

const apiGet = vi.hoisted(() => vi.fn());
const apiPatch = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: vi.fn(), patch: apiPatch, delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({
    can: () => true,
    permissions: ["*:*"],
    user: { id: 1, role: "director" },
    logout: vi.fn(),
  }),
  useOptionalAuth: () => ({ can: () => true, permissions: ["*:*"] }),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/system/roles",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const PLANNER = {
  id: 2,
  code: "planner",
  name: "Planner",
  description: null,
  isSystem: false,
  permissions: ["product:read"],
  userCount: 3,
};

const DIRECTOR = {
  id: 1,
  code: "director",
  name: "Giám đốc",
  description: null,
  isSystem: true,
  permissions: ["*:*"],
  userCount: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  apiGet.mockImplementation((url: string) => {
    if (url === "/roles") {
      return Promise.resolve({ data: [DIRECTOR, PLANNER] });
    }
    if (url === "/users/roles") {
      return Promise.resolve({
        data: [
          { id: 1, code: "director", name: "Director" },
          { id: 2, code: "planner", name: "Planner" },
        ],
      });
    }
    if (url === "/roles/permissions") {
      return Promise.resolve({
        data: [
          {
            module: "sales",
            resource: "quotation",
            permissions: ["quotation:read", "quotation:approve"],
          },
          {
            module: "master-data",
            resource: "product",
            permissions: ["product:read", "product:write"],
          },
        ],
      });
    }
    return Promise.resolve({ data: null });
  });
});

afterEach(cleanup);

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
          auth: viAuth,
          common: viCommon,
          permission: viPermission,
          system: viSystem,
        }}
      >
        <NotificationProvider>
          <RoleListPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("RoleListPage", () => {
  it("shows the holder count and leaves the full-access role uneditable", async () => {
    renderPage();

    // The stored name is English; the screen shows the translated role name.
    expect(await screen.findByText(viAuth.roles.planner)).toBeInTheDocument();
    expect(screen.getByText(viSystem.roles.allPermissions)).toBeInTheDocument();
    expect(screen.getByText(viSystem.roles.wildcardLocked)).toBeInTheDocument();
    // Only the narrowable role offers the assignment control.
    expect(
      screen.getAllByRole("button", { name: viSystem.roles.assign }),
    ).toHaveLength(1);
  });

  it("opens the catalog with the role's current permissions ticked", async () => {
    renderPage();
    await screen.findByText(viAuth.roles.planner);

    fireEvent.click(
      screen.getByRole("button", { name: viSystem.roles.assign }),
    );

    // One row per function, one column per action, and no permission code on screen.
    expect(
      await screen.findByText(viPermission.resources.product),
    ).toBeInTheDocument();
    expect(screen.queryByText("product:read")).not.toBeInTheDocument();

    const label = (permission: string) => {
      const [resource, action] = permission.split(":");
      return `${viPermission.resources[resource as "product"]} — ${
        viPermission.actions[action as "read"]
      }`;
    };
    expect(
      screen.getByRole("checkbox", { name: label("product:read") }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: label("product:write") }),
    ).not.toBeChecked();

    // Modules are banded in the Function List's order: Master Data before Sales, whatever
    // order the API listed them in.
    const headings = screen
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent ?? "");
    const masterDataAt = headings.findIndex((text) =>
      text.includes(viPermission.modules["master-data"]),
    );
    const salesAt = headings.findIndex((text) =>
      text.includes(viPermission.modules.sales),
    );
    expect(masterDataAt).toBeGreaterThanOrEqual(0);
    expect(salesAt).toBeGreaterThan(masterDataAt);
    expect(apiPatch).not.toHaveBeenCalled();
  });
});
