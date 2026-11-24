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

import viCommon from "@/kernel/langs/vi/common.json";
import viModal from "@/kernel/langs/vi/modal.json";
import viTemplate from "@/kernel/langs/vi/template.json";

import { TemplateFormModal } from "@plugins/sales/template/components/TemplateFormModal";
import { TemplateListPage } from "@plugins/sales/template/components/TemplateListPage";
import { TemplatePermission } from "@plugins/sales/template/permissions/template-permission.keys";

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const apiPatch = vi.hoisted(() => vi.fn());
const apiDelete = vi.hoisted(() => vi.fn());
const showError = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const can = vi.hoisted(() =>
  vi.fn((permission: string) => granted.value.has(permission)),
);
const searchParams = vi.hoisted(() => ({ value: new URLSearchParams() }));

vi.mock("@/kernel/core/api/api", () => ({
  default: {
    get: apiGet,
    post: apiPost,
    patch: apiPatch,
    delete: apiDelete,
  },
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
  usePathname: () => "/sales/templates",
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/kernel/core/contexts/NotificationContext", () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError,
    showWarning: vi.fn(),
  }),
}));

// The popup needs real layout to open; a stub button stands in for choosing a catalog item.
vi.mock("@plugins/sales/estimate/components/EstimateItemPicker", () => ({
  EstimateItemPicker: ({
    onPick,
  }: {
    onPick: (item: Record<string, unknown>) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onPick({
          id: 5,
          code: "VT_0005",
          name: "MCCB 3P 100A",
          brand: "ABB",
          unit: "pcs",
        })
      }
    >
      pick-item
    </button>
  ),
}));

const TEMPLATE = {
  id: 3,
  code: "TPL_0003",
  name: "MSB standard",
  description: null,
  isActive: true,
};

function grant(...permissions: string[]) {
  granted.value = new Set(permissions);
}

function wrap(children: React.ReactNode) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, template: viTemplate, modal: viModal }}
      >
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  searchParams.value = new URLSearchParams();
  grant(TemplatePermission.read);
  apiGet.mockImplementation((url: string) =>
    url === "/sales/quotation-templates"
      ? Promise.resolve({
          data: {
            data: [TEMPLATE],
            meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
          },
        })
      : Promise.resolve({ data: null }),
  );
});

afterEach(cleanup);

describe("TemplateListPage", () => {
  it("lists the templates the API returns", async () => {
    render(wrap(<TemplateListPage />));

    expect(await screen.findByText("TPL_0003")).toBeInTheDocument();
    expect(screen.getByText("MSB standard")).toBeInTheDocument();
  });

  it("sends the committed search keyword to the API", async () => {
    render(wrap(<TemplateListPage />));
    await screen.findByText("TPL_0003");

    const box = screen.getByPlaceholderText(viTemplate.searchPlaceholder);
    fireEvent.change(box, { target: { value: "msb" } });
    fireEvent.keyDown(box, { key: "Enter" });

    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith(
        "/sales/quotation-templates",
        expect.objectContaining({
          params: expect.objectContaining({ search: "msb" }),
        }),
      ),
    );
  });

  it("hides the create button from an actor without quotation_template:create", async () => {
    render(wrap(<TemplateListPage />));
    await screen.findByText("TPL_0003");

    expect(screen.queryByText(viTemplate.addButton)).not.toBeInTheDocument();
  });

  it("shows the create button to an actor holding quotation_template:create", async () => {
    grant(TemplatePermission.read, TemplatePermission.create);
    render(wrap(<TemplateListPage />));
    await screen.findByText("TPL_0003");

    expect(screen.getByText(viTemplate.addButton)).toBeInTheDocument();
  });

  it("offers row edit, toggle and delete only with update and delete permissions", async () => {
    const { unmount } = render(wrap(<TemplateListPage />));
    await screen.findByText("TPL_0003");
    expect(screen.queryByTitle(viCommon.edit)).not.toBeInTheDocument();
    expect(screen.queryByTitle(viCommon.delete)).not.toBeInTheDocument();
    expect(screen.queryByTitle(viTemplate.deactivate)).not.toBeInTheDocument();
    unmount();

    grant(
      TemplatePermission.read,
      TemplatePermission.update,
      TemplatePermission.delete,
    );
    render(wrap(<TemplateListPage />));
    await screen.findByText("TPL_0003");
    expect(screen.getByTitle(viCommon.edit)).toBeInTheDocument();
    expect(screen.getByTitle(viCommon.delete)).toBeInTheDocument();
    expect(screen.getByTitle(viTemplate.deactivate)).toBeInTheDocument();
  });
});

describe("TemplateListPage delete", () => {
  it("reports a template a project still uses, once", async () => {
    grant(TemplatePermission.read, TemplatePermission.delete);
    apiDelete.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { message: "Cannot delete template because a project uses it." },
      },
    });
    render(wrap(<TemplateListPage />));
    await screen.findByText("TPL_0003");

    fireEvent.click(screen.getByTitle(viCommon.delete));
    // The dialog's confirm button renders after the row's own delete button.
    const buttons = await screen.findAllByRole("button", {
      name: viCommon.delete,
    });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() =>
      expect(apiDelete).toHaveBeenCalledWith("/sales/quotation-templates/3"),
    );
    await waitFor(() => expect(showError).toHaveBeenCalledTimes(1));
    expect(showError).toHaveBeenCalledWith(viTemplate.toast.inUse);
  });
});

describe("TemplateFormModal", () => {
  function renderForm(onClose = vi.fn()) {
    render(wrap(<TemplateFormModal isOpen onClose={onClose} />));
    return onClose;
  }

  function fillHeader() {
    fireEvent.change(
      screen.getByPlaceholderText(viTemplate.placeholders.code),
      {
        target: { value: "TPL_0006" },
      },
    );
    fireEvent.change(
      screen.getByPlaceholderText(viTemplate.placeholders.name),
      {
        target: { value: "Tủ MSB" },
      },
    );
  }

  function addPanelWithItem(quantity: string) {
    fireEvent.click(screen.getByText(viTemplate.panels.add));
    fireEvent.change(
      screen.getByPlaceholderText(viTemplate.placeholders.panelTag),
      { target: { value: "MSB-01" } },
    );
    fireEvent.click(screen.getByText("pick-item"));
    expect(screen.getByText(/VT_0005/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(viTemplate.panels.quantityHeader), {
      target: { value: quantity },
    });
  }

  it("submits the panel and line payload built with the picker", async () => {
    apiPost.mockResolvedValue({ data: {} });
    const onClose = renderForm();
    fillHeader();
    addPanelWithItem("2");

    fireEvent.click(screen.getByRole("button", { name: viCommon.save }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost).toHaveBeenCalledWith("/sales/quotation-templates", {
      code: "TPL_0006",
      name: "Tủ MSB",
      description: null,
      panels: [
        {
          tag: "MSB-01",
          description: null,
          quantity: 1,
          lines: [{ itemId: 5, quantity: 2, groupLabel: null, note: null }],
        },
      ],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("blocks a line quantity of 0 on the client", async () => {
    renderForm();
    fillHeader();
    addPanelWithItem("0");

    fireEvent.click(screen.getByRole("button", { name: viCommon.save }));

    expect(
      await screen.findByText(viTemplate.validation.lineQuantity),
    ).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("keeps the form open and reports a 409 from the API", async () => {
    apiPost.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { message: "Template code already exists." },
      },
    });
    const onClose = renderForm();
    fillHeader();
    addPanelWithItem("2");

    fireEvent.click(screen.getByRole("button", { name: viCommon.save }));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    // Exactly one toast: the hook drops its own for this 409, the form says it once.
    expect(showError).toHaveBeenCalledTimes(1);
    expect(showError).toHaveBeenCalledWith(viTemplate.toast.codeExists);
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByPlaceholderText(viTemplate.placeholders.code),
    ).toBeInTheDocument();
  });

  it("names a repeated panel tag even when the tag reads like another rule", async () => {
    apiPost.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { message: "Panel tag PROJECT-A is already used." },
      },
    });
    const onClose = renderForm();
    fillHeader();
    addPanelWithItem("2");

    fireEvent.click(screen.getByRole("button", { name: viCommon.save }));

    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(showError).toHaveBeenCalledTimes(1);
    expect(showError).toHaveBeenCalledWith(viTemplate.toast.tagExists);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("never sends the immutable code when editing", async () => {
    apiGet.mockImplementation((url: string) =>
      Promise.resolve({
        data:
          url === "/sales/quotation-templates/3"
            ? {
                ...TEMPLATE,
                panels: [
                  {
                    id: 1,
                    tag: "MSB-01",
                    description: null,
                    quantity: 1,
                    lines: [
                      {
                        id: 1,
                        itemId: 5,
                        quantity: 2,
                        groupLabel: null,
                        note: null,
                        itemCode: "VT_0005",
                        itemName: "MCCB",
                      },
                    ],
                  },
                ],
              }
            : null,
      }),
    );
    apiPatch.mockResolvedValue({ data: {} });
    const onClose = vi.fn();
    render(
      wrap(<TemplateFormModal isOpen onClose={onClose} template={TEMPLATE} />),
    );

    await screen.findByDisplayValue("MSB standard");
    fireEvent.click(screen.getByRole("button", { name: viCommon.save }));

    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    const [url, body] = apiPatch.mock.calls[0];
    expect(url).toBe("/sales/quotation-templates/3");
    expect(body).not.toHaveProperty("code");
    expect(body).toMatchObject({
      name: "MSB standard",
      panels: [{ tag: "MSB-01", lines: [{ itemId: 5, quantity: 2 }] }],
    });
  });
});
