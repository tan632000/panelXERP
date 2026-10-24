import { zodResolver } from "@hookform/resolvers/zod";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useForm, type Resolver } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";

import viCommon from "@/kernel/langs/vi/common.json";
import viProject from "@/kernel/langs/vi/project.json";

import { ProjectFormFields } from "@plugins/crm/project/components/ProjectFormFields";
import { useProjectFormSchema } from "@plugins/crm/project/hooks/useProjectFormSchema";
import {
  EMPTY_PROJECT_FORM,
  toProjectCreatePayload,
  toProjectUpdatePayload,
} from "@plugins/crm/project/utils/form-payload";

import type {
  ProjectFormInput,
  ProjectFormValues,
} from "@plugins/crm/project/schemas/project.schema";
import type { Project } from "@plugins/crm/project/types";

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: vi.fn().mockResolvedValue({ data: null }) },
}));

// The popup needs real layout to open; a stub button stands in for choosing a customer.
vi.mock("@/kernel/core/components/ui/RecordPickerSourceField", () => ({
  RecordPickerSourceField: ({
    value,
    displayLabel,
    onChange,
  }: {
    value: string;
    displayLabel?: string;
    onChange: (customer: { id: number; code: string; name: string }) => void;
  }) => (
    <button
      type="button"
      data-testid="customer-picker"
      data-value={value}
      onClick={() => onChange({ id: 7, code: "KH_0007", name: "Alpha Panels" })}
    >
      {displayLabel || "pick"}
    </button>
  ),
}));

const PROJECT: Project = {
  id: 3,
  code: "DA_0003",
  customerId: 7,
  customerCode: "KH_0007",
  customerName: "Alpha Panels",
  name: "Tower A",
  siteAddress: "1 Site Road",
};

function Harness({
  project,
  onValid,
}: {
  project?: Project;
  onValid: (values: ProjectFormValues) => void;
}) {
  const { schema } = useProjectFormSchema();
  const form = useForm<ProjectFormInput>({
    resolver: zodResolver(schema) as Resolver<ProjectFormInput>,
    defaultValues: project
      ? {
          code: project.code,
          customerId: String(project.customerId),
          name: "",
          siteAddress: "",
          note: "",
        }
      : { ...EMPTY_PROJECT_FORM, code: "DA_0004" },
  });
  return (
    <form
      onSubmit={form.handleSubmit((values) =>
        onValid(values as ProjectFormValues),
      )}
    >
      <ProjectFormFields form={form} project={project} />
      <button type="submit">submit</button>
    </form>
  );
}

function renderForm(project?: Project) {
  const onValid = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider
        locale="vi"
        messages={{ common: viCommon, project: viProject }}
      >
        <Harness project={project} onValid={onValid} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onValid;
}

afterEach(cleanup);

describe("ProjectFormFields", () => {
  it("requires a customer and a name before it submits", async () => {
    const onValid = renderForm();

    fireEvent.click(screen.getByText("submit"));

    expect(
      await screen.findByText(viProject.validation.customerRequired),
    ).toBeInTheDocument();
    expect(
      screen.getByText(viProject.validation.nameRequired),
    ).toBeInTheDocument();
    expect(onValid).not.toHaveBeenCalled();
  });

  it("submits the chosen customer id with the trimmed name", async () => {
    const onValid = renderForm();

    fireEvent.click(screen.getByTestId("customer-picker"));
    expect(screen.getByTestId("customer-picker")).toHaveTextContent(
      "KH_0007 — Alpha Panels",
    );
    fireEvent.change(screen.getByPlaceholderText(viProject.placeholders.name), {
      target: { value: "  Tower A  " },
    });
    fireEvent.click(screen.getByText("submit"));

    await waitFor(() => expect(onValid).toHaveBeenCalledTimes(1));
    expect(
      toProjectCreatePayload(onValid.mock.calls[0][0] as ProjectFormValues),
    ).toEqual({
      code: "DA_0004",
      customerId: 7,
      name: "Tower A",
      siteAddress: undefined,
      note: undefined,
    });
  });

  it("locks the customer and the code when editing, and never sends the customer", () => {
    renderForm(PROJECT);

    expect(screen.queryByTestId("customer-picker")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("KH_0007 — Alpha Panels")).toHaveAttribute(
      "readonly",
    );
    expect(screen.getByDisplayValue("DA_0003")).toHaveAttribute("readonly");

    const payload = toProjectUpdatePayload({
      code: "DA_0003",
      customerId: "7",
      name: "Tower A",
      siteAddress: "",
      note: "",
    });
    expect(payload).not.toHaveProperty("customerId");
  });
});
