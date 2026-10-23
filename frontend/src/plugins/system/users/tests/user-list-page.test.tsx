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
import viSystem from "@/kernel/langs/vi/system.json";

import { getExcelAction, queryExcelAction } from "@/test/helpers/excel-menu";

import { UserListPage } from "@plugins/system/users/components/UserListPage";

const apiGet = vi.hoisted(() => vi.fn());
const apiPatch = vi.hoisted(() => vi.fn());
const apiDelete = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const can = vi.hoisted(() => vi.fn((_permission: string) => true));
const searchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: apiPost, patch: apiPatch, delete: apiDelete },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({
    can,
    permissions: ["*:*"],
    user: { id: 1, role: "director" },
    logout: vi.fn(),
  }),
  useOptionalAuth: () => ({ can: () => true, permissions: ["*:*"] }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.value,
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/system/users",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const USER = {
  id: 12,
  username: "warehouse",
  email: "warehouse@example.com",
  fullName: "Nguyễn Văn Kho",
  phone: null,
  department: "warehouse",
  title: null,
  isActive: true,
  lastLoginAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  roleCode: "warehouse_keeper",
  roleName: "Thủ kho",
};

const listRequests: Array<Record<string, unknown>> = [];

function respond(rows = [USER]) {
  apiGet.mockImplementation((url: string, config?: { params?: unknown }) => {
    const params = (config?.params ?? {}) as Record<string, unknown>;
    if (url === "/users") {
      listRequests.push(params);
      return Promise.resolve({
        data: {
          data: rows,
          meta: { page: 1, limit: 10, total: rows.length, totalPages: 1 },
        },
      });
    }
    if (url === "/users/12") {
      return Promise.resolve({ data: rows[0] });
    }
    if (url === "/users/roles") {
      return Promise.resolve({
        data: [{ id: 2, code: "warehouse_keeper", name: "Thủ kho" }],
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
        messages={{ common: viCommon, system: viSystem }}
      >
        <NotificationProvider>
          <UserListPage />
        </NotificationProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  can.mockImplementation(() => true);
  window.sessionStorage.clear();
  listRequests.length = 0;
  searchParams.value = new URLSearchParams();
  respond();
});

afterEach(cleanup);

describe("UserListPage", () => {
  it("lists the account with its role and state", async () => {
    renderPage();

    expect(await screen.findByText("warehouse")).toBeInTheDocument();
    expect(screen.getByText("Thủ kho")).toBeInTheDocument();
    expect(screen.getByText(viSystem.users.statusActive)).toBeInTheDocument();
    // The department is stored as its English key and shown by its label.
    expect(
      screen.getByText(viCommon.userDepartments.warehouse),
    ).toBeInTheDocument();
  });

  it("asks the API only for the accounts of the chosen state", async () => {
    renderPage();
    await screen.findByText("warehouse");

    fireEvent.click(screen.getByText(viSystem.users.filterStatus));
    // The dropdown commits on mousedown, before the click ever lands.
    fireEvent.mouseDown(
      screen.getByRole("option", { name: viSystem.users.statusInactive }),
    );

    await vi.waitFor(() => {
      expect(listRequests.at(-1)).toMatchObject({ isActive: false });
    });
  });

  it("confirms before deactivating rather than doing it on the click", async () => {
    renderPage();
    await screen.findByText("warehouse");

    fireEvent.click(
      screen.getByRole("button", { name: viSystem.users.deactivate }),
    );

    expect(
      screen.getByText(viSystem.users.confirmDeactivateTitle),
    ).toBeInTheDocument();
    expect(apiPatch).not.toHaveBeenCalled();
  });

  it("deletes the account only once the confirmation is accepted", async () => {
    apiDelete.mockResolvedValue({ data: null });
    renderPage();
    await screen.findByText("warehouse");

    fireEvent.click(screen.getByRole("button", { name: viCommon.delete }));

    expect(
      screen.getByText(viSystem.users.confirmDeleteTitle),
    ).toBeInTheDocument();
    expect(apiDelete).not.toHaveBeenCalled();

    // The row control and the dialog button carry the same label; the dialog is the later one.
    const confirmButtons = screen.getAllByRole("button", {
      name: viSystem.users.delete,
    });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await vi.waitFor(() => {
      expect(apiDelete).toHaveBeenCalledWith("/users/12");
    });
  });

  it("shows initials for an account without a picture and no signature", async () => {
    renderPage();
    await screen.findByText("warehouse");

    expect(screen.getByText("NK")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Chữ ký của Nguyễn Văn Kho" }),
    ).not.toBeInTheDocument();
  });

  it.each([["Ảnh đại diện của Nguyễn Văn Kho"], ["Chữ ký của Nguyễn Văn Kho"]])(
    "opens %s for a quick look",
    async (name) => {
      respond([
        {
          ...USER,
          avatarUrl: "https://files.example.com/avatars/kho.jpg",
          signatureUrl: "https://files.example.com/signatures/kho.png",
        } as typeof USER,
      ]);
      renderPage();
      await screen.findByText("warehouse");

      expect(screen.getAllByAltText(name)).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name }));

      // The cell's thumbnail, and the same image at full size in the preview.
      expect(screen.getAllByAltText(name)).toHaveLength(2);
    },
  );

  const PENDING_USER = {
    ...USER,
    signatureUrl: "https://files.example.com/signatures/kho.png",
    pendingSignatureUrl: "https://files.example.com/signatures/kho-new.png",
    signatureRequestedAt: "2026-09-27T08:00:00.000Z",
  } as typeof USER;

  it("approves a signature waiting for review from its row", async () => {
    respond([PENDING_USER]);
    apiPost.mockResolvedValue({ data: USER });
    renderPage();
    await screen.findByText("warehouse");

    fireEvent.click(
      screen.getByRole("button", {
        name: viSystem.users.signaturePendingBadge,
      }),
    );

    expect(
      screen.getByAltText(viSystem.users.signaturePending),
    ).toHaveAttribute(
      "src",
      "https://files.example.com/signatures/kho-new.png",
    );
    expect(apiPost).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: viSystem.users.signatureApprove }),
    );

    await vi.waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/users/12/signature/approve");
    });
  });

  it("rejects a signature only with a reason", async () => {
    respond([PENDING_USER]);
    apiPost.mockResolvedValue({ data: USER });
    renderPage();
    await screen.findByText("warehouse");

    fireEvent.click(
      screen.getByRole("button", {
        name: viSystem.users.signaturePendingBadge,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: viSystem.users.signatureReject }),
    );

    const submit = screen.getByRole("button", {
      name: viSystem.users.signatureReject,
    });
    expect(submit).toBeDisabled();

    fireEvent.change(
      screen.getByPlaceholderText(
        viSystem.users.placeholders.signatureRejectReason,
      ),
      {
        target: { value: "Chữ ký bị mờ" },
      },
    );
    fireEvent.click(submit);

    await vi.waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/users/12/signature/reject", {
        reason: "Chữ ký bị mờ",
      });
    });
  });

  it("opens the review a notification links to", async () => {
    respond([PENDING_USER]);
    searchParams.value = new URLSearchParams("signatureReview=12");
    renderPage();

    expect(
      await screen.findByAltText(viSystem.users.signaturePending),
    ).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/users/12");
  });

  it("queues an Excel export of the table's columns, never a secret", async () => {
    apiPost.mockResolvedValue({ data: { jobId: "job-users-export-1" } });
    renderPage();
    await screen.findByText("warehouse");

    fireEvent.click(getExcelAction(viCommon.exportExcel));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        "/users/export",
        expect.objectContaining({
          fileName: expect.stringMatching(/^nguoi-dung_\d{4}-\d{2}-\d{2}$/),
          sheet: expect.objectContaining({
            columns: expect.arrayContaining([
              expect.objectContaining({
                key: "username",
                label: viSystem.users.username,
              }),
              expect.objectContaining({
                key: "isActive",
                label: viSystem.users.status,
              }),
            ]),
          }),
        }),
      );
    });
    const sheet = (
      apiPost.mock.calls[0][1] as { sheet: { columns: unknown[] } }
    ).sheet;
    const keys = sheet.columns.map((column) => (column as { key: string }).key);
    expect(keys).not.toEqual(
      expect.arrayContaining(["password", "passwordHash", "signatureUrl"]),
    );
    // Phone and title stay out until the reader turns those columns on.
    expect(keys).not.toContain("phone");
    expect(keys).not.toContain("title");
  });

  it("offers Import Excel to an administrator and opens the import dialog", async () => {
    renderPage();
    await screen.findByText("warehouse");

    fireEvent.click(getExcelAction(viCommon.importExcel));

    expect(
      await screen.findByText(viSystem.users.import.title),
    ).toBeInTheDocument();
  });

  it("hides both Excel actions from an actor without the administrator scope", async () => {
    can.mockImplementation(() => false);
    renderPage();
    await screen.findByText("warehouse");

    expect(queryExcelAction(viCommon.exportExcel)).toBeNull();
    expect(queryExcelAction(viCommon.importExcel)).toBeNull();
  });
});
