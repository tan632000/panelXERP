import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import viCommon from "@/kernel/langs/vi/common.json";
import viProject from "@/kernel/langs/vi/project.json";

import { ProjectFormModal } from "@plugins/crm/project/components/ProjectFormModal";

/** What `GET /projects/next-code` has answered so far; tests change it to simulate a late reply. */
const nextCode = vi.hoisted(() => ({
  data: undefined as { code: string } | undefined,
}));
const createProject = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock("@plugins/crm/project/hooks/api/useProject", () => ({
  useNextProjectCode: () => ({ data: nextCode.data, isError: false }),
  useCreateProject: () => ({ mutateAsync: createProject, isPending: false }),
  useUpdateProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/kernel/core/contexts/NotificationContext", () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
  }),
}));

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: vi.fn().mockResolvedValue({ data: null }) },
}));

// The popup needs real layout to open; a stub button stands in for choosing a customer.
vi.mock("@/kernel/core/components/ui/RecordPickerSourceField", () => ({
  RecordPickerSourceField: ({
    displayLabel,
    onChange,
  }: {
    displayLabel?: string;
    onChange: (customer: { id: number; code: string; name: string }) => void;
  }) => (
    <div>
      <span data-testid="picked">{displayLabel ?? ""}</span>
      <button
        type="button"
        onClick={() =>
          onChange({ id: 7, code: "KH_0007", name: "Alpha Panels" })
        }
      >
        pick-customer
      </button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  nextCode.data = undefined;
  createProject.mockClear();
});

function renderModal() {
  const client = new QueryClient();
  const tree = () => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, project: viProject }}
      >
        <ProjectFormModal isOpen onClose={vi.fn()} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { rerender: () => view.rerender(tree()) };
}

describe("ProjectFormModal", () => {
  it("fills a late suggested code without clearing the customer or name already entered", async () => {
    const { rerender } = renderModal();

    fireEvent.click(screen.getByText("pick-customer"));
    fireEvent.change(screen.getByPlaceholderText(viProject.placeholders.name), {
      target: { value: "Tower A" },
    });

    nextCode.data = { code: "DA_0009" };
    rerender();
    expect(screen.getByDisplayValue("DA_0009")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: viCommon.save }));

    // A form reset on the late code would drop customerId and name: the submit then fails
    // validation and never reaches the API.
    await waitFor(() => expect(createProject).toHaveBeenCalledTimes(1));
    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "DA_0009",
        customerId: 7,
        name: "Tower A",
      }),
    );
  });
});
