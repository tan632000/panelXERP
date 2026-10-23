import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecordPickerField } from "@/kernel/core/components/ui/RecordPickerField";
import viCommon from "@/kernel/langs/vi/common.json";

import type { TableColumn } from "@/kernel/core/components/ui/Table";

interface Row {
  id: number;
  code: string;
  name: string;
}

const ROWS: Row[] = [
  { id: 1, code: "VT_0001", name: "Thép SUS304 tấm 2mm" },
  { id: 2, code: "VT_0003", name: "Thép SPCC tấm" },
];

const COLUMNS: Array<TableColumn<Row>> = [
  { key: "code", header: "Mã NVL" },
  { key: "name", header: "Tên nguyên vật liệu" },
];

const FIELD_PLACEHOLDER = "Click / Enter để chọn (VD: thép)...";
const SEARCH_PLACEHOLDER = "Tìm theo mã, tên, mác thép...";

/** Observers are collected so a test can drive the sentinel that jsdom never intersects. */
const observers: Array<{
  callback: IntersectionObserverCallback;
  observer: IntersectionObserver;
}> = [];

function triggerSentinel() {
  for (const { callback, observer } of observers) {
    callback([{ isIntersecting: true } as IntersectionObserverEntry], observer);
  }
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        observers.push({
          callback,
          observer: this as unknown as IntersectionObserver,
        });
      }
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

interface HarnessProps {
  onSelect?: (row: Row) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  initialDisplayValue?: string;
  /** Code of the record the field already holds. */
  initialValue?: string;
  /** Set for a reference that also accepts a hand-typed value, like an RFQ number. */
  acceptsFreeText?: boolean;
}

/** Mirrors how a form owner binds the field: display label in, selection or clear out. */
function Harness({
  onSelect,
  onLoadMore,
  hasMore = false,
  initialDisplayValue = "",
  initialValue = "",
  acceptsFreeText = false,
}: HarnessProps) {
  const [displayValue, setDisplayValue] = useState(initialDisplayValue);
  const [value, setValue] = useState(initialValue);
  const [search, setSearch] = useState("");

  return (
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <RecordPickerField<Row>
        displayValue={displayValue}
        placeholder={FIELD_PLACEHOLDER}
        title="Tìm nguyên vật liệu"
        columns={COLUMNS}
        records={ROWS}
        rowKey={(row) => String(row.id)}
        value={value}
        getValue={(row) => row.code}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={SEARCH_PLACEHOLDER}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        onSelect={(row) => {
          setDisplayValue(`${row.code} — ${row.name}`);
          setValue(row.code);
          onSelect?.(row);
        }}
        onClear={() => setDisplayValue("")}
        onFreeText={acceptsFreeText ? setDisplayValue : undefined}
      />
      <output data-testid="committed">{displayValue}</output>
      <output data-testid="search">{search}</output>
    </NextIntlClientProvider>
  );
}

function field() {
  return screen.getByPlaceholderText(FIELD_PLACEHOLDER);
}

describe("RecordPickerField", () => {
  it("opens the popup as soon as a pick-only field is clicked", () => {
    render(<Harness />);

    fireEvent.click(field());

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toBeInTheDocument();
  });

  it("cannot be typed into when it only accepts picked records", () => {
    render(<Harness />);

    // Read-only is what keeps a typed keyword from ever passing for a value.
    expect(field()).toHaveAttribute("readonly");

    fireEvent.change(field(), { target: { value: "VT_9999" } });

    expect(field()).toHaveValue("");
    expect(screen.getByTestId("committed")).toHaveTextContent("");
  });

  it("keeps a free-text field typeable and opens its popup from Enter", () => {
    render(<Harness acceptsFreeText />);

    expect(field()).not.toHaveAttribute("readonly");

    fireEvent.change(field(), { target: { value: "thép" } });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(field(), { key: "Enter" });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("search")).toHaveTextContent("thép");
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toHaveValue("thép");
  });

  it("fills the field only once a row is picked", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);

    fireEvent.click(field());
    // Opening alone must not commit a value.
    expect(screen.getByTestId("committed")).toHaveTextContent("");

    fireEvent.click(screen.getByText("VT_0001"));

    expect(onSelect).toHaveBeenCalledWith(ROWS[0]);
    expect(screen.getByTestId("committed")).toHaveTextContent(
      "VT_0001 — Thép SUS304 tấm 2mm",
    );
    expect(field()).toHaveValue("VT_0001 — Thép SUS304 tấm 2mm");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hands focus back to the field after a pick, so Tab moves on to the next field", () => {
    render(<Harness />);

    fireEvent.click(field());
    fireEvent.click(screen.getByText("VT_0001"));

    expect(field()).toHaveFocus();
  });

  it("hands focus back to the field when the popup is dismissed", () => {
    render(<Harness />);

    fireEvent.click(field());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(field()).toHaveFocus();
  });

  it("drops an abandoned keyword and shows the selection again", () => {
    render(<Harness initialDisplayValue="VT_0003 — Thép SPCC tấm" />);

    fireEvent.click(field());
    fireEvent.change(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), {
      target: { value: "nhựa" },
    });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(field()).toHaveValue("VT_0003 — Thép SPCC tấm");
    expect(screen.getByTestId("committed")).toHaveTextContent(
      "VT_0003 — Thép SPCC tấm",
    );
  });

  it("opens on the full list instead of searching for the held selection", () => {
    render(<Harness initialDisplayValue="VT_0001 — Thép SUS304 tấm 2mm" />);

    fireEvent.click(screen.getByLabelText(viCommon.search));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("search")).toHaveTextContent("");
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toHaveValue("");
  });

  it("highlights the held record in the full list", () => {
    render(
      <Harness
        initialDisplayValue="VT_0001 — Thép SUS304 tấm 2mm"
        initialValue="VT_0001"
      />,
    );

    fireEvent.click(screen.getByLabelText(viCommon.search));

    const dialog = screen.getByRole("dialog");
    const held = within(dialog).getByText("VT_0001").closest("tr");
    const other = within(dialog).getByText("VT_0003").closest("tr");
    expect(held?.className).toContain("bg-brand-50");
    expect(other?.className).not.toContain("bg-brand-50");
  });

  it.each([
    ["marks only the row named by selectedKey", "2", ["VT_0003"]],
    ["marks no row for an empty selectedKey", "", []],
  ])("%s", (_name, selectedKey, marked) => {
    render(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <RecordPickerField<Row>
          displayValue="VT_0001 — Thép SUS304 tấm 2mm"
          title="Tìm nguyên vật liệu"
          columns={COLUMNS}
          records={ROWS}
          rowKey={(row) => String(row.id)}
          value="VT_0001"
          getValue={(row) => row.code}
          selectedKey={selectedKey}
          search=""
          onSearchChange={() => {}}
          onSelect={() => {}}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByLabelText(viCommon.search));

    const dialog = screen.getByRole("dialog");
    for (const row of ROWS) {
      const tr = within(dialog).getByText(row.code).closest("tr");
      expect(tr?.className.includes("bg-brand-50")).toBe(
        marked.includes(row.code),
      );
    }
  });

  it("drops the previous keyword when the popup is reopened", () => {
    render(<Harness initialDisplayValue="VT_0001 — Thép SUS304 tấm 2mm" />);

    fireEvent.click(screen.getByLabelText(viCommon.search));
    fireEvent.change(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), {
      target: { value: "VT_0002" },
    });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByLabelText(viCommon.search));

    expect(screen.getByTestId("search")).toHaveTextContent("");
  });

  it("loads the next page when the sentinel below the list scrolls into view", () => {
    const onLoadMore = vi.fn();
    render(<Harness hasMore onLoadMore={onLoadMore} />);

    fireEvent.keyDown(field(), { key: "Enter" });
    triggerSentinel();

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("stays empty after the field is cleared and the popup is dismissed", () => {
    render(<Harness initialDisplayValue="VT_0001 — Thép SUS304 tấm 2mm" />);

    // A read-only field cannot be emptied by hand, so the clear button is the only way out.
    fireEvent.click(screen.getByLabelText(viCommon.clear));
    expect(screen.getByTestId("committed")).toHaveTextContent("");

    fireEvent.click(screen.getByLabelText(viCommon.search));
    fireEvent.keyDown(document, { key: "Escape" });

    // A deleted label must not come back just because nothing was picked.
    expect(field()).toHaveValue("");
    expect(screen.getByTestId("committed")).toHaveTextContent("");
  });

  it("disables values that sibling rows already hold, but keeps its own", () => {
    render(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <RecordPickerField<Row>
          displayValue="VT_0001 — Thép SUS304 tấm 2mm"
          placeholder={FIELD_PLACEHOLDER}
          title="Tìm nguyên vật liệu"
          columns={COLUMNS}
          records={ROWS}
          rowKey={(row) => String(row.id)}
          search=""
          onSearchChange={() => {}}
          onSelect={() => {}}
          value="VT_0001"
          getValue={(row) => row.code}
          takenValues={["VT_0001", "VT_0003"]}
        />
      </NextIntlClientProvider>,
    );

    fireEvent.click(field());

    // Both stay listed: a short reference list would otherwise run out of rows to show.
    const takenRow = screen.getByText("VT_0003").closest("tr");
    const ownRow = screen.getByText("VT_0001").closest("tr");
    expect(takenRow).toHaveAttribute("aria-disabled", "true");
    // VT_0001 is this row's own selection, so it stays pickable.
    expect(ownRow).not.toHaveAttribute("aria-disabled");

    fireEvent.click(screen.getByText("VT_0003"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("keeps Enter from submitting the form the field sits in", () => {
    const onSubmit = vi.fn();
    render(
      <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <RecordPickerField<Row>
            displayValue=""
            placeholder={FIELD_PLACEHOLDER}
            title="Tìm nguyên vật liệu"
            columns={COLUMNS}
            records={ROWS}
            rowKey={(row) => String(row.id)}
            search=""
            onSearchChange={() => {}}
            onSelect={() => {}}
          />
        </form>
      </NextIntlClientProvider>,
    );

    fireEvent.keyDown(field(), { key: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("keeps a hand-typed value when the field accepts free text", () => {
    render(<Harness acceptsFreeText />);

    fireEvent.change(field(), { target: { value: "R_2026_0001" } });
    fireEvent.blur(field());

    expect(screen.getByTestId("committed")).toHaveTextContent("R_2026_0001");
  });

  it("keeps a hand-typed value after the popup is closed without a pick", () => {
    render(<Harness acceptsFreeText />);

    fireEvent.change(field(), { target: { value: "R_2026_0002" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByTestId("committed")).toHaveTextContent("R_2026_0002");
  });

  it("offers no clear button on a pick-only field that holds nothing yet", () => {
    render(<Harness />);

    expect(screen.queryByLabelText(viCommon.clear)).toBeNull();
  });
});
