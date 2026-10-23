import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Table } from "@/kernel/core/components/ui/Table";

import type { TableColumn } from "@/kernel/core/components/ui/Table";

afterEach(cleanup);

interface Row {
  id: string;
  a: string;
  b: string;
}

const columns: Array<TableColumn<Row>> = [
  { key: "a", header: "Column A", style: { width: 120 } },
  { key: "b", header: "Column B", style: { width: 120 } },
];

const data: Row[] = [{ id: "1", a: "x", b: "y" }];

function renderTable() {
  return render(
    <NextIntlClientProvider
      locale="vi"
      messages={{ common: { noResults: "" } }}
    >
      <Table columns={columns} data={data} />
    </NextIntlClientProvider>,
  );
}

describe("Table column resize", () => {
  it("drags only the grabbed column open, like a spreadsheet, and locks every column's width at the first drag", () => {
    // jsdom never lays out real boxes, so rect reads must be stubbed the way the
    // resize handler's first-drag lock (`getBoundingClientRect().width`) expects them.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 120,
      height: 32,
      top: 0,
      left: 0,
      right: 120,
      bottom: 32,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    });

    const { container } = renderTable();
    const table = container.querySelector("table") as HTMLTableElement;
    const thA = container.querySelector(
      'th[data-col-key="a"]',
    ) as HTMLTableCellElement;
    const thB = container.querySelector(
      'th[data-col-key="b"]',
    ) as HTMLTableCellElement;
    const handleB = thB.querySelector('[role="separator"]') as HTMLElement;

    expect(table.style.tableLayout).not.toBe("fixed");

    fireEvent.mouseDown(handleB, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 150 });
    fireEvent.mouseUp(window);

    // The drag locked the whole header row, then widened only the dragged column.
    expect(table.style.tableLayout).toBe("fixed");
    expect(thA.style.width).toBe("120px");
    expect(thB.style.width).toBe("170px");
  });

  it("stops tracking the pointer once the drag ends", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 120,
      height: 32,
      top: 0,
      left: 0,
      right: 120,
      bottom: 32,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    });

    const { container } = renderTable();
    const thB = container.querySelector(
      'th[data-col-key="b"]',
    ) as HTMLTableCellElement;
    const handleB = thB.querySelector('[role="separator"]') as HTMLElement;

    fireEvent.mouseDown(handleB, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 150 });
    fireEvent.mouseUp(window);
    // A stray move after mouseup must be a no-op: the listener was removed with the drag.
    fireEvent.mouseMove(window, { clientX: 500 });

    expect(thB.style.width).toBe("170px");
  });
});
