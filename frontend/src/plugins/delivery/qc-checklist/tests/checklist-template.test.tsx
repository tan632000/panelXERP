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

import { ChecklistTemplatePage } from "@plugins/delivery/qc-checklist/components/ChecklistTemplatePage";
import { QcChecklistPermission } from "@plugins/delivery/qc-checklist/permissions/qc-checklist-permission.keys";

import type { QcChecklistItem } from "@plugins/delivery/qc-checklist/types";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const apiPatch = vi.hoisted(() => vi.fn());
const apiPut = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: apiPatch, put: apiPut },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => {
  const can = (permission: string) => granted.value.has(permission);
  return {
    useAuth: () => ({
      can,
      permissions: [...granted.value],
      user: { id: 7, role: "productionManager" },
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
  usePathname: () => "/delivery/qc/checklist",
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const item = (
  id: number,
  name: string,
  position: number,
  active = true,
): QcChecklistItem => ({ id, name, position, active });

const ITEMS = [
  item(11, "Vỏ tủ, sơn và cánh cửa", 1),
  item(12, "Đấu dây đúng bản vẽ", 2),
  item(13, "Thử không tải", 3, false),
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
        messages={{ common: viCommon, delivery: viDelivery }}
      >
        <NotificationProvider>
          <ChecklistTemplatePage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const rowOf = (name: string) =>
  screen.getByText(name).closest("li") as HTMLElement;

const MANAGER = [QcChecklistPermission.read, QcChecklistPermission.manage];

beforeEach(() => {
  vi.clearAllMocks();
  granted.value = new Set(MANAGER);
  apiGet.mockResolvedValue({ data: ITEMS });
});

afterEach(cleanup);

describe("ChecklistTemplatePage", () => {
  it("lists the items in order and asks for the hidden ones only with manage", async () => {
    renderPage();

    await screen.findByText(ITEMS[0].name);
    expect(apiGet).toHaveBeenCalledWith("/delivery/qc/checklist-items", {
      params: { includeHidden: true },
    });
    const names = screen
      .getAllByRole("listitem")
      .map((row) => within(row).getByTestId("item-name").textContent);
    expect(names).toEqual(ITEMS.map((entry) => entry.name));
  });

  it("renders the manage controls only with qc_checklist:manage", async () => {
    renderPage();
    await screen.findByText(ITEMS[0].name);
    expect(
      screen.getByRole("button", { name: viDelivery.checklist.add }),
    ).toBeInTheDocument();
    expect(
      within(rowOf(ITEMS[0].name)).getByRole("button", {
        name: viDelivery.checklist.hide,
      }),
    ).toBeInTheDocument();
    cleanup();

    granted.value = new Set([QcChecklistPermission.read]);
    renderPage();
    await screen.findByText(ITEMS[0].name);
    expect(apiGet).toHaveBeenLastCalledWith("/delivery/qc/checklist-items", {
      params: { includeHidden: false },
    });
    expect(
      screen.queryByRole("button", { name: viDelivery.checklist.add }),
    ).toBeNull();
    expect(
      within(screen.getByRole("list")).queryAllByRole("button"),
    ).toEqual([]);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("sends the full id list, hidden items included, when an item moves down", async () => {
    apiPut.mockResolvedValue({ data: ITEMS });
    renderPage();
    await screen.findByText(ITEMS[0].name);

    fireEvent.click(
      within(rowOf(ITEMS[0].name)).getByRole("button", {
        name: viDelivery.checklist.moveDown.replace("{name}", ITEMS[0].name),
      }),
    );

    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith(
        "/delivery/qc/checklist-items/order",
        { ids: [12, 11, 13] },
      ),
    );
  });

  it("offers no move up on the first item and no move down on the last", async () => {
    renderPage();
    await screen.findByText(ITEMS[0].name);

    const first = within(rowOf(ITEMS[0].name));
    const last = within(rowOf(ITEMS[2].name));
    expect(
      first.getByRole("button", {
        name: viDelivery.checklist.moveUp.replace("{name}", ITEMS[0].name),
      }),
    ).toBeDisabled();
    expect(
      last.getByRole("button", {
        name: viDelivery.checklist.moveDown.replace("{name}", ITEMS[2].name),
      }),
    ).toBeDisabled();
  });

  it("marks a hidden item with the Ẩn badge and offers Hiện instead of Ẩn", async () => {
    renderPage();
    await screen.findByText(ITEMS[2].name);

    const hidden = within(rowOf(ITEMS[2].name));
    expect(hidden.getByTestId("hidden-badge")).toHaveTextContent(
      viDelivery.checklist.hiddenBadge,
    );
    expect(
      hidden.getByRole("button", { name: viDelivery.checklist.show }),
    ).toBeInTheDocument();
    expect(
      hidden.queryByRole("button", { name: viDelivery.checklist.hide }),
    ).toBeNull();
    expect(
      within(rowOf(ITEMS[0].name)).queryByTestId("hidden-badge"),
    ).toBeNull();
  });

  it("hides and shows an item through a patch", async () => {
    apiPatch.mockResolvedValue({ data: ITEMS[0] });
    renderPage();
    await screen.findByText(ITEMS[0].name);

    fireEvent.click(
      within(rowOf(ITEMS[0].name)).getByRole("button", {
        name: viDelivery.checklist.hide,
      }),
    );
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith(
        "/delivery/qc/checklist-items/11",
        { active: false },
      ),
    );

    fireEvent.click(
      within(rowOf(ITEMS[2].name)).getByRole("button", {
        name: viDelivery.checklist.show,
      }),
    );
    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith(
        "/delivery/qc/checklist-items/13",
        { active: true },
      ),
    );
  });

  it("renames an item inline with the trimmed name", async () => {
    apiPatch.mockResolvedValue({ data: ITEMS[1] });
    renderPage();
    await screen.findByText(ITEMS[1].name);

    fireEvent.click(
      within(rowOf(ITEMS[1].name)).getByRole("button", {
        name: viDelivery.checklist.rename,
      }),
    );
    const input = screen.getByDisplayValue(ITEMS[1].name);
    fireEvent.change(input, { target: { value: "  Đấu dây theo sơ đồ  " } });
    fireEvent.click(
      within(input.closest("li") as HTMLElement).getByRole("button", {
        name: viDelivery.checklist.save,
      }),
    );

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith(
        "/delivery/qc/checklist-items/12",
        { name: "Đấu dây theo sơ đồ" },
      ),
    );
  });

  it("adds an item with the trimmed name and refuses a blank one", async () => {
    apiPost.mockResolvedValue({ data: item(14, "Mới", 4) });
    renderPage();
    await screen.findByText(ITEMS[0].name);

    const add = screen.getByRole("button", { name: viDelivery.checklist.add });
    expect(add).toBeDisabled();
    fireEvent.change(
      screen.getByPlaceholderText(viDelivery.checklist.addPlaceholder),
      { target: { value: "  Mới  " } },
    );
    fireEvent.click(add);

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/delivery/qc/checklist-items", {
        name: "Mới",
      }),
    );
  });

  it("says so when the template has no item", async () => {
    apiGet.mockResolvedValue({ data: [] });
    renderPage();

    expect(
      await screen.findByText(viDelivery.checklist.none),
    ).toBeInTheDocument();
  });
});
