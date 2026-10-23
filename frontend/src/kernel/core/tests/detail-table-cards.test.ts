import { afterEach, describe, expect, it } from "vitest";

import {
  alignCardCaptions,
  isEditableLineTable,
  labelCardGrids,
  labelCardTables,
  resolveHeaderCaptions,
} from "@/kernel/core/lib/detail-table-cards";

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

const noShortLabel = () => undefined;

describe("detail table cards", () => {
  it("captions each body cell with the header above it, groups included", () => {
    const root = mount(`
      <table>
        <thead>
          <tr><th rowspan="2">#</th><th rowspan="2">Material</th><th colspan="2">Invoice</th><th rowspan="2"></th></tr>
          <tr><th>No.</th><th>Date</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td><td>VT_01</td><td>HD-1</td><td>09/10/2026</td>
            <td><div><button title="Delete this line"><svg class="tabler-icon-trash"></svg></button></div></td>
          </tr>
        </tbody>
        <tfoot><tr><td colspan="2">Total</td><td>3</td><td></td><td></td></tr></tfoot>
      </table>`);
    const table = root.querySelector("table") as HTMLTableElement;

    expect(
      resolveHeaderCaptions(table.tHead as HTMLTableSectionElement),
    ).toEqual(["#", "Material", "Invoice · No.", "Invoice · Date", ""]);

    labelCardTables(root, (button) =>
      button.querySelector(".tabler-icon-trash") ? "Delete" : undefined,
    );

    const [index, material, invoiceNo, invoiceDate, actions] = Array.from(
      table.tBodies[0].rows[0].cells,
    );
    expect(table.hasAttribute("data-card-table")).toBe(true);
    expect(index.getAttribute("data-card-index")).toBe("number");
    expect(material.getAttribute("data-label")).toBe("Material");
    expect(invoiceNo.getAttribute("data-label")).toBe("Invoice · No.");
    expect(invoiceDate.getAttribute("data-label")).toBe("Invoice · Date");
    expect(actions.hasAttribute("data-card-actions")).toBe(true);
    expect(
      actions.querySelector("button")?.getAttribute("data-card-label"),
    ).toBe("Delete");

    const [total, sum] = Array.from(
      (table.tFoot as HTMLTableSectionElement).rows[0].cells,
    );
    expect(total.hasAttribute("data-card-wide")).toBe(true);
    expect(sum.getAttribute("data-label")).toBe("Invoice · No.");
  });

  it("follows a rowspan cell into the rows below", () => {
    const root = mount(`
      <table>
        <thead><tr><th>Order</th><th>Line</th><th>Qty</th></tr></thead>
        <tbody>
          <tr><td rowspan="2">DH-1</td><td>A</td><td>1</td></tr>
          <tr><td>B</td><td>2</td></tr>
        </tbody>
      </table>`);
    labelCardTables(root, noShortLabel);

    const second = root.querySelectorAll("tbody tr")[1].querySelectorAll("td");
    expect(second[0].getAttribute("data-label")).toBe("Line");
    expect(second[1].getAttribute("data-label")).toBe("Qty");
  });

  it("leaves tables without a header row, and opted-out tables, as tables", () => {
    const root = mount(`
      <table><tbody><tr><td>Key</td><td>Value</td></tr></tbody></table>
      <div data-no-cards><table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></div>`);
    labelCardTables(root, noShortLabel);

    root.querySelectorAll("table").forEach((table) => {
      expect(table.hasAttribute("data-card-table")).toBe(false);
    });
  });

  it("keeps a button with its own text as it is", () => {
    const root = mount(`
      <table>
        <thead><tr><th>Status</th></tr></thead>
        <tbody><tr><td><button title="Approve line">Approve</button></td></tr></tbody>
      </table>`);
    labelCardTables(root, noShortLabel);

    const cell = root.querySelector("td") as HTMLTableCellElement;
    expect(cell.getAttribute("data-label")).toBe("Status");
    expect(cell.hasAttribute("data-card-actions")).toBe(false);
    expect(cell.querySelector("button")?.hasAttribute("data-card-label")).toBe(
      false,
    );
  });

  it("cards only a modal's line editors, not its read-only or checkbox tables", () => {
    const root = mount(`
      <table id="editor"><thead><tr><th>STT</th><th>Code</th></tr></thead>
        <tbody><tr><td>1</td><td><input /></td></tr></tbody></table>
      <table id="readonly"><thead><tr><th>Code</th></tr></thead>
        <tbody><tr><td>VT-01</td></tr></tbody></table>
      <table id="picker"><thead><tr><th></th><th>Code</th></tr></thead>
        <tbody><tr><td><input type="checkbox" /></td><td>VT-01</td></tr></tbody></table>
    `);
    labelCardTables(root, noShortLabel, isEditableLineTable);
    const carded = (id: string) =>
      root.querySelector(`#${id}`)?.hasAttribute("data-card-table");
    expect(carded("editor")).toBe(true);
    expect(carded("readonly")).toBe(false);
    expect(carded("picker")).toBe(false);
  });

  it("captions a grid line editor's cells with its header row", () => {
    const root = mount(`
      <div class="inline-block" id="track">
        <div class="grid grid-cols-[9rem_9rem_2rem]"><span>Code</span><span>Qty</span><span class="sr-only">Remove</span></div>
        <div class="flex flex-col">
          <div class="grid grid-cols-[9rem_9rem_2rem]" id="row">
            <div><input /></div><div><input /></div><button aria-label="Remove"></button>
          </div>
        </div>
      </div>
      <div class="inline-block" id="readonly">
        <div class="grid grid-cols-[9rem]"><span>Code</span></div>
        <div class="grid grid-cols-[9rem]"><span>VT-01</span></div>
      </div>
    `);
    labelCardGrids(root);
    const cells = Array.from(root.querySelector("#row")?.children ?? []);
    expect(root.querySelector("#track")?.hasAttribute("data-card-grid")).toBe(
      true,
    );
    expect(root.querySelector("#row")?.hasAttribute("data-card-row")).toBe(
      true,
    );
    expect(cells.map((cell) => cell.getAttribute("data-label"))).toEqual([
      "Code",
      "Qty",
      null,
    ]);
    expect(cells[2].hasAttribute("data-card-actions")).toBe(true);
    expect(
      root.querySelector("#readonly")?.hasAttribute("data-card-grid"),
    ).toBe(false);
  });
});

describe("alignCardCaptions", () => {
  /** jsdom lays nothing out, so each box reports the top it is given here. */
  function placeAt(element: Element | null, top: number) {
    if (!element) throw new Error("missing element");
    element.getBoundingClientRect = () => ({ top }) as DOMRect;
  }

  it("pads the captions of a card row to the one that wraps", () => {
    const root = mount(`
      <div data-form-cards>
        <div data-card-grid>
          <div data-card-row>
            <div data-label="Short"><input /></div>
            <div data-label="A caption long enough to wrap"><input /></div>
            <div data-label="Next row"><input /></div>
          </div>
        </div>
      </div>
    `);
    const [short, long, next] = Array.from(
      root.querySelectorAll<HTMLElement>("[data-label]"),
    );
    placeAt(short, 100);
    placeAt(short.firstElementChild, 120);
    placeAt(long, 100);
    placeAt(long.firstElementChild, 136);
    placeAt(next, 200);
    placeAt(next.firstElementChild, 220);

    alignCardCaptions(root);

    expect(short.style.getPropertyValue("--card-caption-pad")).toBe("16px");
    expect(long.style.getPropertyValue("--card-caption-pad")).toBe("");
    expect(next.style.getPropertyValue("--card-caption-pad")).toBe("");
  });
});

describe("labelCardGrids — hidden row values", () => {
  it("skips a hidden input so each cell keeps its own column's caption", () => {
    const root = mount(`
      <div class="inline-block">
        <div class="grid grid-cols-[1fr_1fr]"><span>Code</span><span>Name</span></div>
        <div class="grid grid-cols-[1fr_1fr]">
          <input type="hidden" value="7" />
          <div><input value="FG-1" /></div>
          <div><input value="Bracket" /></div>
        </div>
      </div>
    `);

    labelCardGrids(root);

    const cells = root.querySelectorAll("[data-label]");
    expect(
      Array.from(cells, (cell) => cell.getAttribute("data-label")),
    ).toEqual(["Code", "Name"]);
    expect(cells[0].querySelector("input")?.value).toBe("FG-1");
  });
});

describe("labelCardTable — placeholders", () => {
  it("leaves out a cell kept invisible only to hold its column", () => {
    const root = mount(`
      <table>
        <thead><tr><th>Material</th><th>Invoice no.</th><th>Invoice date</th></tr></thead>
        <tbody><tr>
          <td><input value="NVL-1" /></td>
          <td><div class="invisible h-[38px]"></div></td>
          <td></td>
        </tr></tbody>
      </table>
    `);

    labelCardTables(root, noShortLabel);

    const [material, invoice, invoiceDate] = Array.from(
      root.querySelectorAll("td"),
    );
    expect(material.getAttribute("data-label")).toBe("Material");
    expect(invoice.hasAttribute("data-label")).toBe(false);
    expect(invoice.hasAttribute("data-card-empty")).toBe(true);
    expect(invoiceDate.hasAttribute("data-card-empty")).toBe(true);
  });
});

describe("labelCardGrids — action and checkbox cells", () => {
  it("treats a titled icon as the row action and a checkbox as a field", () => {
    const root = mount(`
      <div class="inline-block">
        <div class="grid grid-cols-[1fr_1fr_2rem]"><span>Price</span><span>Active</span><span></span></div>
        <div class="grid grid-cols-[1fr_1fr_2rem]">
          <div><input value="10" /></div>
          <div><input type="checkbox" /></div>
          <span title="Locked"><svg></svg></span>
        </div>
      </div>
    `);

    labelCardGrids(root);

    const [, active, lock] = Array.from(
      root.querySelectorAll("[data-card-row] > *"),
    );
    expect(active.getAttribute("data-label")).toBe("Active");
    expect(lock.hasAttribute("data-card-actions")).toBe(true);
  });
});
