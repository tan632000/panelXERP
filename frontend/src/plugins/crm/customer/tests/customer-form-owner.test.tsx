import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";

import viCommon from "@/kernel/langs/vi/common.json";
import viCustomer from "@/kernel/langs/vi/customer.json";

import { CustomerFormFields } from "@plugins/crm/customer/components/CustomerFormFields";

import type { CustomerFormInput } from "@plugins/crm/customer/schemas/customer.schema";
import type { Customer } from "@plugins/crm/customer/types";

vi.mock("@/kernel/core/api/api", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [{ id: 11, fullName: "Demo Sales A" }] }),
  },
}));

// The dropdown widget needs real layout to open; the label of its empty choice is what matters.
vi.mock("@/kernel/core/components/ui/FormSelect", () => ({
  FormSelect: ({
    options,
  }: {
    options: Array<{ value: string; label: string }>;
  }) => (
    <ul>
      {options.map((option) => (
        <li key={option.value}>{option.label}</li>
      ))}
    </ul>
  ),
}));

const CUSTOMER: Customer = {
  id: 7,
  code: "KH_0007",
  name: "Alpha",
  salesOwnerId: 11,
  salesOwnerName: "Demo Sales A",
};

function Harness({ customer }: { customer?: Customer }) {
  const form = useForm<CustomerFormInput>({
    defaultValues: { code: "KH_0007", name: "Alpha", salesOwnerId: "" },
  });
  return <CustomerFormFields form={form} customer={customer} />;
}

function renderFields(customer?: Customer) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon, customer: viCustomer }}>
        <Harness customer={customer} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("CustomerFormFields owner option", () => {
  it("labels the empty owner choice as the default owner on create", () => {
    renderFields();
    expect(screen.getByText(viCustomer.ownerDefault)).toBeInTheDocument();
    expect(screen.queryByText(viCustomer.ownerKeep)).not.toBeInTheDocument();
  });

  it("labels the empty owner choice as keeping the current owner on edit", () => {
    renderFields(CUSTOMER);
    expect(screen.getByText(viCustomer.ownerKeep)).toBeInTheDocument();
    expect(screen.queryByText(viCustomer.ownerDefault)).not.toBeInTheDocument();
  });
});
