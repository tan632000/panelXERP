import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Table, type TableColumn } from "@/kernel/core/components/ui/Table";
import viCommon from "@/kernel/langs/vi/common.json";

const apiGet = vi.hoisted(() => vi.fn());
const apiPut = vi.hoisted(() => vi.fn());

vi.mock("@/kernel/core/api/api", () => ({
  default: { get: apiGet, put: apiPut },
}));

afterEach(cleanup);

interface Row {
  id: string;
  code: string;
  name: string;
  note: string;
}

const ROWS: Row[] = [
  { id: "1", code: "VTK_0001", name: "Vòng bi", note: "Kho A" },
  { id: "2", code: "VTK_0002", name: "Dây curoa", note: "Kho B" },
];

const COLUMNS: Array<TableColumn<Row>> = [
  { key: "code", header: "Mã", render: (_, item) => <span>{item.code}</span> },
  { key: "name", header: "Tên", render: (_, item) => <span>{item.name}</span> },
  {
    key: "note",
    header: "Ghi chú",
    render: (_, item) => <span>{item.note}</span>,
  },
  {
    key: "actions",
    header: "",
    render: () => (
      <button type="button" key="edit">
        Sửa
      </button>
    ),
  },
];

const MODULE_KEY = "other_material_list_v2";
const ENDPOINT = `/list-preferences/${MODULE_KEY}`;

function renderTable(preferenceKey = MODULE_KEY, selectable = false) {
  return render(
    <NextIntlClientProvider locale="vi" messages={{ common: viCommon }}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <Table
          columns={COLUMNS}
          data={ROWS}
          selectable={selectable}
          columnPreferenceKey={preferenceKey}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const settingsLabel = viCommon.tableColumns.settings;

/**
 * Waits for the stored choice to land.
 *
 * The trigger's tooltip counts the hidden columns, so it is the one place in the DOM that
 * tells a loaded preference apart from the "everything visible" state the table starts in.
 */
async function preferenceLoaded(hiddenCount: number) {
  await screen.findByTitle(
    hiddenCount === 0
      ? settingsLabel
      : viCommon.tableColumns.hiddenCount.replace(
          "{count}",
          String(hiddenCount),
        ),
  );
}

/**
 * Waits for a stored freeze to land: the popup's own hint counts the pinned columns, which
 * is what tells a loaded freeze apart from the unfrozen state the table starts in.
 */
async function freezeLoaded(popup: HTMLElement, frozenCount: number) {
  await within(popup).findByText(
    viCommon.tableColumns.frozenCount.replace("{count}", String(frozenCount)),
  );
}

/** The table itself, so an assertion never matches a column name inside the popup. */
function table() {
  return document.querySelector("table") as HTMLElement;
}

function openSettings() {
  fireEvent.click(screen.getByRole("button", { name: settingsLabel }));
  return screen.getByRole("dialog", { name: settingsLabel });
}

function checkboxFor(popup: HTMLElement, label: string) {
  return within(popup).getByRole("checkbox", { name: label });
}

beforeEach(() => {
  apiGet.mockReset();
  apiPut.mockReset();
  apiGet.mockResolvedValue({ data: null });
  apiPut.mockImplementation(
    (
      _url: string,
      body: { visibleColumns: string[]; frozenColumn: string | null },
    ) =>
      Promise.resolve({
        data: { moduleKey: MODULE_KEY, ...body },
      }),
  );
});

describe("table column settings", () => {
  it("opens rightwards from the trigger so the popup covers the list, not the sidebar", async () => {
    renderTable();
    await preferenceLoaded(0);

    const trigger = screen.getByRole("button", { name: settingsLabel });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 120,
      left: 240,
      right: 264,
      width: 24,
      height: 20,
      x: 240,
      y: 100,
      toJSON: () => ({}),
    });

    expect(openSettings().style.left).toBe("240px");
  });

  it("shows every column while the account has stored no choice", async () => {
    renderTable();

    await waitFor(() => expect(apiGet).toHaveBeenCalledWith(ENDPOINT));
    await preferenceLoaded(0);
    expect(screen.getByText("Mã")).toBeInTheDocument();
    expect(screen.getByText("Tên")).toBeInTheDocument();
    expect(screen.getByText("Ghi chú")).toBeInTheDocument();
  });

  it("offers every column the table draws, the actions column included", async () => {
    renderTable();
    await preferenceLoaded(0);

    const popup = openSettings();

    expect(within(popup).getAllByRole("checkbox")).toHaveLength(COLUMNS.length);
    expect(checkboxFor(popup, "Mã")).toBeChecked();
    expect(checkboxFor(popup, "Ghi chú")).toBeChecked();
    // Drawn without header text, so the popup names it from the shared column labels.
    expect(
      checkboxFor(popup, viCommon.tableColumns.actionsColumn),
    ).toBeChecked();
  });

  it("hides the actions column when the account turns it off", async () => {
    renderTable();
    await preferenceLoaded(0);

    fireEvent.click(
      checkboxFor(openSettings(), viCommon.tableColumns.actionsColumn),
    );

    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith(ENDPOINT, {
        visibleColumns: ["code", "name", "note"],
        frozenColumn: null,
        columnWidths: {},
      }),
    );
    expect(
      within(table()).queryByRole("button", { name: "Sửa" }),
    ).not.toBeInTheDocument();
  });

  it("hides a column and stores the remaining ones on the account", async () => {
    renderTable();
    await preferenceLoaded(0);

    fireEvent.click(checkboxFor(openSettings(), "Ghi chú"));

    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith(ENDPOINT, {
        visibleColumns: ["code", "name", "actions"],
        frozenColumn: null,
        columnWidths: {},
      }),
    );
    expect(within(table()).queryByText("Ghi chú")).not.toBeInTheDocument();
    expect(within(table()).queryByText("Kho A")).not.toBeInTheDocument();
    expect(within(table()).getByText("Vòng bi")).toBeInTheDocument();
  });

  it("restores a column in the table's own order, not at the end", async () => {
    apiGet.mockResolvedValue({
      data: { moduleKey: MODULE_KEY, visibleColumns: ["note"] },
    });
    renderTable();
    await preferenceLoaded(3);

    fireEvent.click(checkboxFor(openSettings(), "Mã"));

    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith(ENDPOINT, {
        visibleColumns: ["code", "note"],
        frozenColumn: null,
        columnWidths: {},
      }),
    );
  });

  it("applies the stored choice of the signed-in account on first paint", async () => {
    apiGet.mockResolvedValue({
      data: { moduleKey: MODULE_KEY, visibleColumns: ["code"] },
    });
    renderTable();
    await preferenceLoaded(3);

    expect(within(table()).queryByText("Ghi chú")).not.toBeInTheDocument();
    expect(within(table()).queryByText("Tên")).not.toBeInTheDocument();
    expect(within(table()).getByText("VTK_0001")).toBeInTheDocument();
  });

  it("keeps the last visible column, so no list can be emptied of data", async () => {
    apiGet.mockResolvedValue({
      data: { moduleKey: MODULE_KEY, visibleColumns: ["code"] },
    });
    renderTable();
    await preferenceLoaded(3);

    const popup = openSettings();
    const last = checkboxFor(popup, "Mã");
    expect(last).toBeDisabled();

    fireEvent.click(last);
    expect(apiPut).not.toHaveBeenCalled();
  });

  it("brings every hidden column back at once", async () => {
    apiGet.mockResolvedValue({
      data: { moduleKey: MODULE_KEY, visibleColumns: ["code"] },
    });
    renderTable();
    await preferenceLoaded(3);

    const popup = openSettings();
    fireEvent.click(
      within(popup).getByRole("button", {
        name: viCommon.tableColumns.showAll,
      }),
    );

    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith(ENDPOINT, {
        visibleColumns: ["code", "name", "note", "actions"],
        frozenColumn: null,
        columnWidths: {},
      }),
    );
    await waitFor(() =>
      expect(within(table()).getByText("Ghi chú")).toBeInTheDocument(),
    );
  });

  /**
   * The gear belongs beside the select-all checkbox, at a fixed spot at the start of the
   * header: a wide list no longer has to be scrolled sideways to reach it.
   */
  it("puts the gear in the same header cell as the select-all checkbox", async () => {
    renderTable(MODULE_KEY, true);
    await preferenceLoaded(0);

    const cell = screen
      .getByRole("button", { name: settingsLabel })
      .closest("th");

    expect(cell).not.toBeNull();
    expect(within(cell as HTMLElement).getByRole("checkbox")).toBe(
      within(table()).getAllByRole("checkbox")[0],
    );
    expect(cell).toBe(within(table()).getAllByRole("columnheader")[0]);
  });

  it("adds no column of its own when the checkbox cell hosts the gear", async () => {
    renderTable(MODULE_KEY, true);
    await preferenceLoaded(0);

    // Selection cell plus the four declared columns, and nothing extra.
    expect(within(table()).getAllByRole("columnheader")).toHaveLength(
      COLUMNS.length + 1,
    );
  });

  it("falls back to the trailing header when a list has no selection column", async () => {
    renderTable();
    await preferenceLoaded(0);

    const headers = within(table()).getAllByRole("columnheader");
    const cell = screen
      .getByRole("button", { name: settingsLabel })
      .closest("th");

    expect(cell).toBe(headers[headers.length - 1]);
    expect(within(table()).queryAllByRole("checkbox")).toHaveLength(0);
  });

  /**
   * Hiding the actions column takes the gear's host away, so it falls back to a column of
   * its own rather than leaving the reader no way back to the popup.
   */
  it("moves the gear to its own column once the actions column is hidden", async () => {
    apiGet.mockResolvedValue({
      data: { moduleKey: MODULE_KEY, visibleColumns: ["code", "name", "note"] },
    });
    renderTable();
    await preferenceLoaded(1);

    const headers = within(table()).getAllByRole("columnheader");
    const cell = screen
      .getByRole("button", { name: settingsLabel })
      .closest("th");

    expect(cell).toBe(headers[0]);
    expect(headers).toHaveLength(4);
  });

  it("freezes up to the picked column and stores it on the account", async () => {
    renderTable();
    await preferenceLoaded(0);

    const popup = openSettings();
    fireEvent.click(
      within(popup).getByRole("button", {
        name: viCommon.tableColumns.freeze.replace("{column}", "Tên"),
      }),
    );

    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith(ENDPOINT, {
        visibleColumns: ["code", "name", "note", "actions"],
        frozenColumn: "name",
        columnWidths: {},
      }),
    );
  });

  it("pins the picked column and every column before it", async () => {
    apiGet.mockResolvedValue({
      data: {
        moduleKey: MODULE_KEY,
        visibleColumns: ["code", "name", "note", "actions"],
        frozenColumn: "name",
      },
    });
    renderTable();
    await preferenceLoaded(0);

    await waitFor(() => {
      const headers = within(table()).getAllByRole("columnheader");
      expect(headers[0]).toHaveClass("sticky");
      expect(headers[1]).toHaveClass("sticky");
      expect(headers[2]).not.toHaveClass("sticky");
    });
  });

  it("unfreezes when the frozen column is picked again", async () => {
    apiGet.mockResolvedValue({
      data: {
        moduleKey: MODULE_KEY,
        visibleColumns: ["code", "name", "note", "actions"],
        frozenColumn: "name",
      },
    });
    renderTable();
    await preferenceLoaded(0);

    const popup = openSettings();
    await freezeLoaded(popup, 2);
    fireEvent.click(
      within(popup).getByRole("button", {
        name: viCommon.tableColumns.unfreeze.replace("{column}", "Tên"),
      }),
    );

    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith(ENDPOINT, {
        visibleColumns: ["code", "name", "note", "actions"],
        frozenColumn: null,
        columnWidths: {},
      }),
    );
  });

  it("drops the freeze when the frozen column is hidden", async () => {
    apiGet.mockResolvedValue({
      data: {
        moduleKey: MODULE_KEY,
        visibleColumns: ["code", "name", "note", "actions"],
        frozenColumn: "name",
      },
    });
    renderTable();
    await preferenceLoaded(0);

    const popup = openSettings();
    await freezeLoaded(popup, 2);
    fireEvent.click(checkboxFor(popup, "Tên"));

    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith(ENDPOINT, {
        visibleColumns: ["code", "note", "actions"],
        frozenColumn: null,
        columnWidths: {},
      }),
    );
  });

  it("hides every column but the first in one go", async () => {
    renderTable();
    await preferenceLoaded(0);

    const popup = openSettings();
    fireEvent.click(
      within(popup).getByRole("button", {
        name: viCommon.tableColumns.hideAll,
      }),
    );

    // The first column stays: a list stripped of every data column has nothing to read.
    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith(ENDPOINT, {
        visibleColumns: ["code"],
        frozenColumn: null,
        columnWidths: {},
      }),
    );
    await waitFor(() =>
      expect(within(table()).queryByText("Vòng bi")).not.toBeInTheDocument(),
    );
    expect(within(table()).getByText("VTK_0001")).toBeInTheDocument();
  });

  it("offers nothing to hide once a single column is left", async () => {
    apiGet.mockResolvedValue({
      data: { moduleKey: MODULE_KEY, visibleColumns: ["code"] },
    });
    renderTable();
    await preferenceLoaded(3);

    expect(
      within(openSettings()).getByRole("button", {
        name: viCommon.tableColumns.hideAll,
      }),
    ).toBeDisabled();
  });

  /**
   * A column brought back out of hiding shifts the pinned ones to the right. The offsets
   * have to be re-read from the header for that: the restored column has no measured width
   * of its own yet, and a stale offset would stack the pinned columns on top of each other.
   */
  it("re-measures the pinned offsets when a hidden column is brought back", async () => {
    const cellWidth = 100;
    const measure = vi
      .spyOn(HTMLTableCellElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        width: cellWidth,
        height: 20,
        top: 0,
        bottom: 20,
        left: 0,
        right: cellWidth,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

    apiGet.mockResolvedValue({
      data: {
        moduleKey: MODULE_KEY,
        visibleColumns: ["note", "actions"],
        frozenColumn: "note",
      },
    });
    renderTable();
    await preferenceLoaded(2);

    // "Ghi chú" is the only column left, so it is pinned flush against the left edge.
    await waitFor(() =>
      expect(within(table()).getAllByRole("columnheader")[0]).toHaveStyle({
        left: "0px",
      }),
    );

    const popup = openSettings();
    // One at a time: the popup writes through the cache, and a second click fired before
    // that lands would be computed against the choice the first one replaced.
    fireEvent.click(checkboxFor(popup, "Mã"));
    await waitFor(() =>
      expect(within(table()).getByText("VTK_0001")).toBeInTheDocument(),
    );
    fireEvent.click(checkboxFor(popup, "Tên"));
    await waitFor(() =>
      expect(within(table()).getByText("Vòng bi")).toBeInTheDocument(),
    );

    // Restored ahead of it, the two columns push the pinned edge out by their own widths.
    await waitFor(() => {
      const headers = within(table()).getAllByRole("columnheader");
      expect(headers[1]).toHaveStyle({ left: `${cellWidth}px` });
      expect(headers[2]).toHaveStyle({ left: `${cellWidth * 2}px` });
    });

    measure.mockRestore();
  });

  it("carries no settings column and reads no preference without a key", async () => {
    renderTable("");

    expect(
      screen.queryByRole("button", { name: settingsLabel }),
    ).not.toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
    expect(within(table()).getByText("Ghi chú")).toBeInTheDocument();
  });
});
