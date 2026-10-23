import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Table } from "@/kernel/core/components/ui/Table";
import viCommon from "@/kernel/langs/vi/common.json";

import type { TableColumn } from "@/kernel/core/components/ui/Table";

interface Row {
  id: number;
  code: string;
}

const ROWS: Row[] = [{ id: 1, code: "PNK-NVL-2026-0001" }];

afterEach(cleanup);

/**
 * A list row opens its detail on double-click, while its action buttons and checkbox act on
 * their own. A quick double press on one of those controls used to bubble to the row, navigate
 * away and unmount the modal the button had just opened (director feedback on the NVL OK
 * receipt list and the PO list).
 */
function renderTable(activateRowOn?: "single" | "double") {
  const onRowClick = vi.fn();
  const onQuickIssue = vi.fn();
  const columns: Array<TableColumn<Row>> = [
    { key: "code", header: "Số phiếu" },
    {
      key: "actions",
      header: "",
      render: () => (
        <div onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={onQuickIssue}>
            quick-issue
          </button>
        </div>
      ),
    },
  ];
  render(
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <Table<Row>
        columns={columns}
        data={ROWS}
        rowKey={(row) => String(row.id)}
        selectable
        selectedKeys={[]}
        onSelectionChange={vi.fn()}
        onRowClick={onRowClick}
        activateRowOn={activateRowOn}
      />
    </NextIntlClientProvider>,
  );
  return { onRowClick, onQuickIssue };
}

describe("table row controls never activate the row", () => {
  it("keeps a double-clicked action button from opening the row", () => {
    const { onRowClick, onQuickIssue } = renderTable();
    const button = screen.getByText("quick-issue");

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.doubleClick(button);

    expect(onQuickIssue).toHaveBeenCalled();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("keeps a double-clicked row checkbox from opening the row", () => {
    const { onRowClick } = renderTable();
    const checkbox = screen.getAllByRole("checkbox").at(-1) as HTMLElement;

    fireEvent.doubleClick(checkbox);
    fireEvent.doubleClick(checkbox.closest("td") as HTMLElement);

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("still opens the row from a plain cell", () => {
    const { onRowClick } = renderTable();

    fireEvent.doubleClick(screen.getByText("PNK-NVL-2026-0001"));

    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("applies the same guard to single-click activation", () => {
    const { onRowClick } = renderTable("single");

    fireEvent.click(screen.getByText("quick-issue"));
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("PNK-NVL-2026-0001"));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});
