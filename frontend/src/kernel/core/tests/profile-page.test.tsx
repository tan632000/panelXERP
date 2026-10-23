import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProfilePage } from "@/kernel/core/auth/components/ProfilePage";
import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viAuth from "@/kernel/langs/vi/auth.json";
import viCommon from "@/kernel/langs/vi/common.json";

const authState = vi.hoisted(() => ({
  user: {
    id: 12,
    username: "warehouse",
    fullName: "Nguyễn Văn Kho",
    email: "warehouse@example.com",
    role: "warehouse_keeper",
    phone: null as string | null,
    department: "warehouse" as string | null,
    title: null as string | null,
    avatarUrl: null as string | null,
    signatureUrl: null as string | null,
    pendingSignatureUrl: null as string | null,
    signatureRequestedAt: null as string | null,
    signatureRejectionReason: null as string | null,
    lastLoginAt: null as string | null,
  },
  permissions: ["raw_material_stock:read"] as string[],
  /** Whether the account holds full system access, which is what `can` answers here. */
  fullAccess: true,
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({
    user: authState.user,
    permissions: authState.permissions,
    isLoading: false,
    isAuthenticated: true,
    can: () => authState.fullAccess,
    logout: vi.fn(),
    applySessionUpdate: vi.fn(),
  }),
  useOptionalAuth: () => ({ can: () => true, permissions: [] as string[] }),
}));

// The sidebar is the heaviest thing on the screen and none of these assertions are about it.
vi.mock("@/kernel/core/components/layout/AppSidebar", () => ({
  AppSidebar: ({
    moduleKey,
    drawer,
  }: {
    moduleKey: string;
    drawer?: boolean;
  }) => (
    <nav
      data-testid={drawer ? "sidebar-drawer" : "sidebar"}
      data-module={moduleKey}
    />
  ),
}));

vi.mock("@/kernel/i18n/navigation", () => ({
  usePathname: () => "/profile",
}));

vi.mock("@/kernel/core/components/ui/PageHeaderUserMenu", () => ({
  PageHeaderUserMenu: () => null,
}));

function renderProfile() {
  return render(
    <NextIntlClientProvider
      locale="vi"
      messages={{ auth: viAuth, common: viCommon }}
    >
      <NotificationProvider>
        <ProfilePage />
      </NotificationProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("ProfilePage", () => {
  it("opens the sidebar as a drawer from the header menu button on a phone", () => {
    renderProfile();

    expect(screen.queryByTestId("sidebar-drawer")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: viCommon.openMenu }));
    expect(screen.getByTestId("sidebar-drawer")).toBeInTheDocument();
  });

  it("keeps the system sidebar alongside the account details", () => {
    renderProfile();

    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByText("@warehouse")).toBeInTheDocument();
    expect(screen.getByText("warehouse@example.com")).toBeInTheDocument();
    // Stored as the English key, shown by its label.
    expect(screen.getByText("Kho")).toBeInTheDocument();
    expect(screen.queryByText("warehouse")).not.toBeInTheDocument();
  });

  it("renders the role label rather than the seeded code", () => {
    renderProfile();

    expect(screen.getAllByText("Thủ kho").length).toBeGreaterThan(0);
    expect(screen.queryByText("warehouse_keeper")).not.toBeInTheDocument();
  });

  it("marks the fields the account has not filled in", () => {
    renderProfile();

    // Phone, job title and last sign-in are all empty on this account.
    expect(screen.getAllByText("Chưa cập nhật")).toHaveLength(3);
  });

  it("offers each action once, in the header of the panel it belongs to", () => {
    renderProfile();

    for (const name of [
      "Chỉnh sửa thông tin",
      "Đổi mật khẩu",
      "Cập nhật chữ ký",
    ]) {
      expect(screen.getAllByRole("button", { name })).toHaveLength(1);
    }
  });

  it("opens the change-password modal from the security section", () => {
    renderProfile();

    // The section shows a button, not the form itself.
    expect(screen.queryByText("Mật khẩu hiện tại")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Đổi mật khẩu" }));

    expect(screen.getByText("Mật khẩu hiện tại")).toBeInTheDocument();
    expect(screen.getByText("Mật khẩu mới")).toBeInTheDocument();
  });

  it("opens the edit form filled with the fields the account already has", () => {
    renderProfile();

    expect(
      screen.queryByDisplayValue("Nguyễn Văn Kho"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Chỉnh sửa thông tin" }),
    );

    expect(screen.getByDisplayValue("Nguyễn Văn Kho")).toBeInTheDocument();
    // The department is picked from the list, which opens on the stored one.
    expect(screen.getByDisplayValue("Kho")).toBeInTheDocument();
  });

  it("shows the initials until the account has an avatar", () => {
    const { rerender } = renderProfile();

    expect(screen.queryByAltText("Ảnh đại diện")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Đổi ảnh đại diện" }),
    ).toBeInTheDocument();

    authState.user.avatarUrl = "https://files.example.com/avatars/me.png";
    rerender(
      <NextIntlClientProvider
        locale="vi"
        messages={{ auth: viAuth, common: viCommon }}
      >
        <NotificationProvider>
          <ProfilePage />
        </NotificationProvider>
      </NextIntlClientProvider>,
    );

    expect(screen.getByAltText("Ảnh đại diện")).toHaveAttribute(
      "src",
      "https://files.example.com/avatars/me.png",
    );

    // With a picture on file, the frame opens it rather than going straight to a file picker.
    fireEvent.click(screen.getByRole("button", { name: "Xem ảnh đại diện" }));
    expect(screen.getAllByAltText("Ảnh đại diện")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Đổi ảnh đại diện" }),
    ).toBeInTheDocument();
    authState.user.avatarUrl = null;
  });

  it("offers both ways to set a signature, and shows the one on file", () => {
    const { rerender } = renderProfile();

    expect(screen.getByText("Chưa có chữ ký điện tử")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Xóa chữ ký" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cập nhật chữ ký" }));

    expect(screen.getByText("Cập nhật chữ ký điện tử")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tải ảnh chữ ký" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // Nothing to save until a photo is processed or a stroke is drawn.
    expect(screen.getByRole("button", { name: "Lưu chữ ký" })).toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Vẽ chữ ký" }));

    expect(screen.getByText("Ký tại đây")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu chữ ký" })).toBeDisabled();

    authState.user.signatureUrl = "https://files.example.com/signatures/me.png";
    rerender(
      <NextIntlClientProvider
        locale="vi"
        messages={{ auth: viAuth, common: viCommon }}
      >
        <NotificationProvider>
          <ProfilePage />
        </NotificationProvider>
      </NextIntlClientProvider>,
    );

    expect(screen.getAllByAltText("Chữ ký điện tử")[0]).toHaveAttribute(
      "src",
      "https://files.example.com/signatures/me.png",
    );
    expect(
      screen.getByRole("button", { name: "Xóa chữ ký" }),
    ).toBeInTheDocument();
    authState.user.signatureUrl = null;
  });

  it("lets any account edit its email, asking for the current password once it changes", () => {
    authState.fullAccess = false;
    renderProfile();

    fireEvent.click(
      screen.getByRole("button", { name: "Chỉnh sửa thông tin" }),
    );

    const email = screen.getByDisplayValue("warehouse@example.com");
    expect(email).not.toHaveAttribute("readonly");
    expect(
      document.querySelector('input[name="currentPassword"]'),
    ).not.toBeInTheDocument();

    fireEvent.change(email, { target: { value: "kho-moi@example.com" } });

    expect(
      document.querySelector('input[name="currentPassword"]'),
    ).toBeInTheDocument();
    expect(screen.getByText(viAuth.emailChangeHint)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: viAuth.saveProfile }));

    expect(
      screen.getByText(viAuth.currentPasswordRequired),
    ).toBeInTheDocument();
    authState.fullAccess = true;
  });

  it("tells an account without full access that a new signature needs approval", () => {
    authState.fullAccess = false;
    renderProfile();

    fireEvent.click(screen.getByRole("button", { name: "Cập nhật chữ ký" }));

    expect(screen.getByText(viAuth.signature.reviewNotice)).toBeInTheDocument();
    authState.fullAccess = true;
  });

  it("shows a signature waiting for approval beside the current one", () => {
    authState.user.signatureUrl = "https://files.example.com/signatures/me.png";
    authState.user.pendingSignatureUrl =
      "https://files.example.com/signatures/new.png";
    authState.user.signatureRejectionReason = "Chữ ký bị mờ";
    renderProfile();

    expect(screen.getByAltText("Chữ ký điện tử")).toBeInTheDocument();
    expect(screen.getByAltText(viAuth.signature.pendingAlt)).toHaveAttribute(
      "src",
      "https://files.example.com/signatures/new.png",
    );
    expect(screen.getByText(viAuth.signature.pendingBadge)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: viAuth.signature.withdraw }),
    ).toBeInTheDocument();
    // An older rejection no longer applies once a new signature is waiting.
    expect(screen.queryByText(/Chữ ký bị mờ/)).not.toBeInTheDocument();

    authState.user.signatureUrl = null;
    authState.user.pendingSignatureUrl = null;
    authState.user.signatureRejectionReason = null;
  });

  it("shows why the last submitted signature was rejected", () => {
    authState.user.signatureRejectionReason = "Chữ ký bị mờ";
    renderProfile();

    expect(
      screen.getByText("Chữ ký mới bị từ chối: Chữ ký bị mờ"),
    ).toBeInTheDocument();
    authState.user.signatureRejectionReason = null;
  });
});
