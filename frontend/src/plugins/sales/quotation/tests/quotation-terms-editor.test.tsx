import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import viQuotation from "@/kernel/langs/vi/quotation.json";

import { QuotationTermsEditor } from "@plugins/sales/quotation/components/approval/QuotationTermsEditor";

import type { QuotationVersion } from "@plugins/sales/quotation/types";

const TERMS = ["Warranty 12 months", "Delivery in 1 - 2 weeks"];
const labels = viQuotation.terms;

function renderEditor(options: { editable: boolean; saving?: boolean }) {
  const onSave = vi.fn();
  render(
    <NextIntlClientProvider
      locale="vi"
      messages={{ common: {}, quotation: viQuotation }}
    >
      <QuotationTermsEditor
        version={{ terms: TERMS } as QuotationVersion}
        editable={options.editable}
        saving={options.saving ?? false}
        onSave={onSave}
      />
    </NextIntlClientProvider>,
  );
  return onSave;
}

const termBox = (n: number) =>
  screen.getByLabelText(labels.termN.replace("{n}", String(n)));
const save = () => screen.getByRole("button", { name: labels.save });

afterEach(cleanup);

describe("quotation terms editor", () => {
  it("lists the terms of a version that is not editable, with no inputs", () => {
    renderEditor({ editable: false });

    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(
      TERMS,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: labels.save })).toBeNull();
  });

  it("starts clean, and saves the edited, trimmed list", () => {
    const onSave = renderEditor({ editable: true });
    expect(save()).toBeDisabled();

    fireEvent.change(termBox(2), {
      target: { value: "  Delivery in 3 weeks " },
    });
    expect(save()).toBeEnabled();
    fireEvent.click(save());

    expect(onSave).toHaveBeenCalledWith([
      "Warranty 12 months",
      "Delivery in 3 weeks",
    ]);
  });

  it("adds a term, which must be filled before it can be saved", () => {
    const onSave = renderEditor({ editable: true });

    fireEvent.click(screen.getByRole("button", { name: labels.add }));
    expect(save()).toBeDisabled();
    expect(screen.getByText(labels.validation.blank)).toBeInTheDocument();

    fireEvent.change(termBox(3), { target: { value: "Valid 15 days" } });
    fireEvent.click(save());

    expect(onSave).toHaveBeenCalledWith([...TERMS, "Valid 15 days"]);
  });

  it("removes a term", () => {
    const onSave = renderEditor({ editable: true });

    fireEvent.click(
      screen.getByRole("button", {
        name: labels.remove.replace("{n}", "1"),
      }),
    );
    fireEvent.click(save());

    expect(onSave).toHaveBeenCalledWith(["Delivery in 1 - 2 weeks"]);
  });

  it("keeps Save off while a save is in flight", () => {
    renderEditor({ editable: true, saving: true });
    fireEvent.change(termBox(1), { target: { value: "Changed" } });

    expect(save()).toBeDisabled();
  });
});
