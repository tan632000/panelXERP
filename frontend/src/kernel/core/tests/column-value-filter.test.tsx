import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ColumnValueFilter } from "@/kernel/core/components/ui/ColumnValueFilter";
import viCommon from "@/kernel/langs/vi/common.json";

import type { TableColumnFilterSelections } from "@/kernel/core/types/column-filter";

afterEach(cleanup);

const LABELS: Record<string, string> = {
  rawMaterial: "NVL",
  roundSteel: "Thép tròn",
};

function renderFilter(
  selections: TableColumnFilterSelections,
  onSelectionsChange = vi.fn(),
) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <ColumnValueFilter
          label="Phân loại"
          column="classification"
          selections={selections}
          onSelectionsChange={onSelectionsChange}
          localValues={["rawMaterial", "roundSteel"]}
          labelForValue={(value) => LABELS[value] ?? value}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onSelectionsChange;
}

describe("ColumnValueFilter", () => {
  it("shows the column's single selected value by its cell label", () => {
    renderFilter({ classification: ["roundSteel"] });
    expect(screen.getByText("Thép tròn")).toBeInTheDocument();
  });

  it("names every value when the column header picked several", () => {
    renderFilter({ classification: ["rawMaterial", "roundSteel"] });
    expect(screen.getByText("NVL, Thép tròn")).toBeInTheDocument();
  });

  it("clears only its own column, keeping the table's other selections", () => {
    const onChange = renderFilter({
      classification: ["roundSteel"],
      status: ["approved"],
    });
    fireEvent.click(screen.getAllByTitle(viCommon.clear)[0]);
    expect(onChange).toHaveBeenCalledWith({ status: ["approved"] });
  });
});
