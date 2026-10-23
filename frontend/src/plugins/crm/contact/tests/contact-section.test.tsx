import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import viCommon from "@/kernel/langs/vi/common.json";
import viContact from "@/kernel/langs/vi/contact.json";

import { ContactSection } from "@plugins/crm/contact/components/ContactSection";
import { ContactPermission } from "@plugins/crm/contact/permissions/contact-permission.keys";

const apiGet = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const featureEnabled = vi.hoisted(() => ({ value: true }));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useAuth: () => ({ can, permissions: [...granted.value] }),
  useOptionalAuth: () => ({ can, permissions: [...granted.value] }),
}));

vi.mock("@/kernel/platform/features/enabled-feature-keys", () => ({
  isFrontendFeatureEnabled: (key: string) =>
    key === "contact" ? featureEnabled.value : true,
}));

const CONTACTS = [
  { id: 1, customerId: 7, name: "Lan Nguyen", position: "Buyer", isPrimary: true },
  { id: 2, customerId: 7, name: "Minh Tran", position: null, isPrimary: false },
];

function renderSection() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, contact: viContact }}
      >
        <NotificationProvider>
          <ContactSection customerId={7} />
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
  featureEnabled.value = true;
  apiGet.mockResolvedValue({
    data: {
      data: CONTACTS,
      meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
    },
  });
});

afterEach(cleanup);

describe("ContactSection", () => {
  it("shows nothing and asks for nothing without contact:read", () => {
    grant();
    renderSection();

    expect(screen.queryByText(viContact.title)).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("hides the section and calls no route while the contact feature is disabled", () => {
    featureEnabled.value = false;
    grant(ContactPermission.read, ContactPermission.create);
    renderSection();

    expect(screen.queryByText(viContact.title)).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("lists the customer's contacts and marks the primary one", async () => {
    grant(ContactPermission.read);
    renderSection();

    expect(await screen.findByText("Lan Nguyen")).toBeInTheDocument();
    expect(screen.getByText("Minh Tran")).toBeInTheDocument();
    expect(screen.getAllByText(viContact.primary)).toHaveLength(1);
    expect(apiGet).toHaveBeenCalledWith("/contacts", {
      params: { customerId: 7, limit: 100 },
    });
  });

  it("offers add only with contact:create", async () => {
    grant(ContactPermission.read);
    const { unmount } = renderSection();
    await screen.findByText("Lan Nguyen");
    expect(screen.queryByText(viContact.addButton)).not.toBeInTheDocument();
    unmount();

    grant(ContactPermission.read, ContactPermission.create);
    renderSection();
    await screen.findByText("Lan Nguyen");
    expect(screen.getByText(viContact.addButton)).toBeInTheDocument();
  });

  it("offers edit and delete controls only with contact:update and contact:delete", async () => {
    grant(ContactPermission.read, ContactPermission.update);
    const { unmount } = renderSection();
    await screen.findByText("Lan Nguyen");
    expect(screen.getAllByTitle(viCommon.edit)).toHaveLength(2);
    expect(screen.queryByTitle(viCommon.delete)).not.toBeInTheDocument();
    unmount();

    grant(ContactPermission.read, ContactPermission.delete);
    renderSection();
    await screen.findByText("Lan Nguyen");
    expect(screen.queryByTitle(viCommon.edit)).not.toBeInTheDocument();
    expect(screen.getAllByTitle(viCommon.delete)).toHaveLength(2);
  });
});
