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
import viProject from "@/kernel/langs/vi/project.json";

import { ProjectFormModal } from "@plugins/crm/project/components/ProjectFormModal";
import { TemplatePermission } from "@plugins/sales/template/permissions/template-permission.keys";

import type { Project } from "@plugins/crm/project/types";

const TEMPLATES = [
  { id: 1, code: "TPL_0001", name: "Tủ điện tổng", isActive: true },
  { id: 2, code: "TPL_0002", name: "Tủ bơm", isActive: true },
  { id: 3, code: "TPL_0003", name: "Mẫu đã tắt", isActive: false },
];

const createProject = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const updateProject = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const apiGet = vi.hoisted(() => vi.fn());
const granted = vi.hoisted(() => ({ value: new Set<string>() }));

vi.mock("@plugins/crm/project/hooks/api/useProject", () => ({
  useNextProjectCode: () => ({ data: { code: "DA_0009" }, isError: false }),
  useCreateProject: () => ({ mutateAsync: createProject, isPending: false }),
  useUpdateProject: () => ({ mutateAsync: updateProject, isPending: false }),
}));

vi.mock("@/kernel/core/auth/AuthContext", () => ({
  useOptionalAuth: () => ({
    can: (permission: string) => granted.value.has(permission),
  }),
}));

vi.mock("@/kernel/core/contexts/NotificationContext", () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
  }),
}));

vi.mock("@/kernel/core/api/api", () => ({ default: { get: apiGet } }));

// The popup needs real layout to open; a stub button stands in for choosing a customer.
vi.mock("@/kernel/core/components/ui/RecordPickerSourceField", () => ({
  RecordPickerSourceField: ({
    onChange,
  }: {
    onChange: (customer: { id: number; code: string; name: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onChange({ id: 7, code: "KH_0007", name: "Alpha Panels" })}
    >
      pick-customer
    </button>
  ),
}));

// The dropdown widget needs real layout to open; a native select exposes the same options.
vi.mock("@/kernel/core/components/ui/FormSelect", () => ({
  FormSelect: ({
    label,
    options,
    value,
    onChange,
  }: {
    label: string;
    options: Array<{ value: string; label: string }>;
    value?: string;
    onChange?: (e: { target: { value: string } }) => void;
  }) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange?.({ target: { value: e.target.value } })}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const PROJECT: Project = {
  id: 5,
  code: "DA_0005",
  customerId: 7,
  customerCode: "KH_0007",
  customerName: "Alpha Panels",
  name: "Tower A",
  siteAddress: "Hanoi",
  note: "Floor 3",
  quotationTemplateId: 2,
  quotationTemplateName: "Tủ bơm",
};

beforeEach(() => {
  granted.value = new Set([TemplatePermission.read]);
  // Honours the `isActive` filter like the endpoint: without it every template comes back.
  apiGet.mockImplementation(
    (_url: string, config?: { params?: { isActive?: boolean } }) => {
      const rows =
        config?.params?.isActive === true
          ? TEMPLATES.filter((template) => template.isActive)
          : TEMPLATES;
      return Promise.resolve({
        data: { data: rows, meta: { total: rows.length } },
      });
    },
  );
});

afterEach(() => {
  cleanup();
  createProject.mockClear();
  updateProject.mockClear();
  apiGet.mockReset();
});

function renderModal(project?: Project) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, project: viProject }}
      >
        <ProjectFormModal isOpen onClose={vi.fn()} project={project} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const save = () =>
  fireEvent.click(screen.getByRole("button", { name: viCommon.save }));

const templatesLoaded = () =>
  waitFor(() =>
    expect(
      screen.getByRole("option", { name: /TPL_0001/ }),
    ).toBeInTheDocument(),
  );

describe("project template picker", () => {
  it("lists only active templates and sends null for the no-template choice", async () => {
    renderModal(PROJECT);
    await templatesLoaded();

    const labels = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(labels).toEqual([
      viProject.quotationTemplateNone,
      "TPL_0001 — Tủ điện tổng",
      "TPL_0002 — Tủ bơm",
    ]);

    fireEvent.change(screen.getByLabelText(viProject.quotationTemplate), {
      target: { value: "" },
    });
    save();

    await waitFor(() => expect(updateProject).toHaveBeenCalledTimes(1));
    expect(updateProject).toHaveBeenCalledWith({
      id: 5,
      data: {
        code: "DA_0005",
        name: "Tower A",
        siteAddress: "Hanoi",
        note: "Floor 3",
        quotationTemplateId: null,
      },
    });
  });

  it("leaves the create payload as before when no template is chosen, and sends the id when one is", async () => {
    renderModal();
    await templatesLoaded();
    fireEvent.click(screen.getByText("pick-customer"));
    fireEvent.change(screen.getByPlaceholderText(viProject.placeholders.name), {
      target: { value: "Tower A" },
    });
    save();

    await waitFor(() => expect(createProject).toHaveBeenCalledTimes(1));
    expect(createProject.mock.calls[0][0]).toEqual({
      code: "DA_0009",
      customerId: 7,
      name: "Tower A",
    });

    fireEvent.change(screen.getByLabelText(viProject.quotationTemplate), {
      target: { value: "1" },
    });
    save();
    await waitFor(() => expect(createProject).toHaveBeenCalledTimes(2));
    expect(createProject.mock.calls[1][0]).toMatchObject({
      quotationTemplateId: 1,
    });
  });

  it("hides the picker and omits quotationTemplateId without the template read permission", async () => {
    granted.value = new Set();
    renderModal(PROJECT);

    expect(
      screen.queryByLabelText(viProject.quotationTemplate),
    ).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();

    save();
    await waitFor(() => expect(updateProject).toHaveBeenCalledTimes(1));
    expect(updateProject.mock.calls[0][0].data).not.toHaveProperty(
      "quotationTemplateId",
    );
  });

  it("shows the template an edited project already has even when it is no longer active", async () => {
    renderModal({
      ...PROJECT,
      quotationTemplateId: 3,
      quotationTemplateName: "Mẫu đã tắt",
    });
    await templatesLoaded();

    const select = screen.getByLabelText(
      viProject.quotationTemplate,
    ) as HTMLSelectElement;
    expect(select.value).toBe("3");
    expect(
      screen.getByRole("option", { name: "Mẫu đã tắt" }),
    ).toBeInTheDocument();
  });

  it("does not resend the template of an edited project when it is unchanged, so a switched-off one cannot block the save", async () => {
    renderModal({
      ...PROJECT,
      quotationTemplateId: 3,
      quotationTemplateName: "Mẫu đã tắt",
    });
    await templatesLoaded();
    fireEvent.change(screen.getByPlaceholderText(viProject.placeholders.name), {
      target: { value: "Tower B" },
    });
    save();

    await waitFor(() => expect(updateProject).toHaveBeenCalledTimes(1));
    const { data } = updateProject.mock.calls[0][0];
    expect(data.name).toBe("Tower B");
    expect(data).not.toHaveProperty("quotationTemplateId");
  });

  it("omits quotationTemplateId on create without the template read permission", async () => {
    granted.value = new Set();
    renderModal();
    fireEvent.click(screen.getByText("pick-customer"));
    fireEvent.change(screen.getByPlaceholderText(viProject.placeholders.name), {
      target: { value: "Tower A" },
    });
    save();

    await waitFor(() => expect(createProject).toHaveBeenCalledTimes(1));
    expect(createProject.mock.calls[0][0]).not.toHaveProperty(
      "quotationTemplateId",
    );
  });

  it("hides the picker and leaves the stored template alone when the template list fails", async () => {
    apiGet.mockRejectedValue(new Error("404"));
    renderModal(PROJECT);

    await waitFor(() =>
      expect(
        screen.queryByLabelText(viProject.quotationTemplate),
      ).not.toBeInTheDocument(),
    );
    save();
    await waitFor(() => expect(updateProject).toHaveBeenCalledTimes(1));
    expect(updateProject.mock.calls[0][0].data).not.toHaveProperty(
      "quotationTemplateId",
    );
  });
});
