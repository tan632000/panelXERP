import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecordPickerDialog } from "@/kernel/core/components/ui/RecordPickerDialog";
import viCommon from "@/kernel/langs/vi/common.json";

import type { TableColumn } from "@/kernel/core/components/ui/Table";

interface Row {
  id: number;
  poNo: string;
  material: string;
}

const ROWS: Row[] = Array.from({ length: 30 }, (_, index) => ({
  id: index + 1,
  poNo: `HP-HC-2026-${String(index + 1).padStart(4, "0")}`,
  material: `HC_${String(index + 1).padStart(4, "0")}`,
}));

const COLUMNS: Array<TableColumn<Row>> = [
  { key: "poNo", header: "PO No." },
  { key: "material", header: "Material" },
];

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <RecordPickerDialog
        isOpen
        onClose={() => {}}
        title="Select PO"
        columns={COLUMNS}
        records={ROWS}
        rowKey={(item) => String(item.id)}
        onSelect={() => {}}
        search=""
        onSearchChange={() => {}}
        tableClassName="w-max min-w-full"
      />
    </NextIntlClientProvider>,
  );
}

describe("RecordPickerDialog single scroller (Feedback No.156)", () => {
  it("renders rows without a nested horizontal scroller", () => {
    const { container } = renderDialog();

    expect(screen.getByText("HP-HC-2026-0001")).toBeInTheDocument();

    // The dialog owns the only scroller (`overflow-auto`); the table must not
    // bring its own `overflow-x-auto` frame, otherwise the horizontal bar sinks
    // to the bottom of all rows and is unreachable (No.156).
    expect(container.querySelectorAll(".overflow-x-auto")).toHaveLength(0);
  });
});
