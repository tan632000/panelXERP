import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viLocation from "@/kernel/langs/vi/location.json";
import viModal from "@/kernel/langs/vi/modal.json";

import { LocationListPage } from "@plugins/catalog/location/components/LocationListPage";
import { LocationPermission } from "@plugins/catalog/location/permissions/location-permission.keys";

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
    user: { id: 41, role: "storekeeper" },
    logout: vi.fn(),
  }),
  useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.value,
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/catalog/locations",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const LOCATION = {
  id: 7,
  code: "A-01-02",
  name: "Shelf A1",
  note: null,
  isActive: true,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function respond() {
  apiGet.mockImplementation((url: string) => {
    if (url === "/catalog/locations") {
      return Promise.resolve({
        data: {
          data: [LOCATION],
          meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
        },
      });
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
          location: viLocation,
          modal: viModal,
        }}
      >
        <NotificationProvider>
          <LocationListPage />
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
  grant(LocationPermission.read);
  respond();
});

afterEach(cleanup);

describe("LocationListPage", () => {
  it("lists the locations the API returns, with their name and status", async () => {
    renderPage();

    expect(await screen.findByText("A-01-02")).toBeInTheDocument();
    expect(screen.getByText("Shelf A1")).toBeInTheDocument();
    expect(screen.getByText(viLocation.statusActive)).toBeInTheDocument();
  });

  it("hides the create button from an actor without location:create", async () => {
    renderPage();
    await screen.findByText("A-01-02");

    expect(screen.queryByText(viLocation.addButton)).not.toBeInTheDocument();
  });

  it("shows the create button to an actor holding location:create", async () => {
    grant(LocationPermission.read, LocationPermission.create);
    renderPage();
    await screen.findByText("A-01-02");

    expect(screen.getByText(viLocation.addButton)).toBeInTheDocument();
  });

  it("offers the row edit and delete controls only with location:update and location:delete", async () => {
    const { unmount } = renderPage();
    await screen.findByText("A-01-02");
    expect(screen.queryByTitle(viCommon.edit)).not.toBeInTheDocument();
    expect(screen.queryByTitle(viCommon.delete)).not.toBeInTheDocument();
    unmount();

    grant(
      LocationPermission.read,
      LocationPermission.update,
      LocationPermission.delete,
    );
    renderPage();
    await screen.findByText("A-01-02");
    expect(screen.getByTitle(viCommon.edit)).toBeInTheDocument();
    expect(screen.getByTitle(viCommon.delete)).toBeInTheDocument();
  });
});
