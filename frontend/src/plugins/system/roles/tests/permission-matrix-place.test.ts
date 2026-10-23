import { describe, expect, it } from "vitest";

import {
  MATRIX_ACTIONS,
  matrixCellsOf,
  matrixPlaceOf,
} from "@plugins/system/roles/hooks/usePermissionMatrix";

describe("matrixPlaceOf", () => {
  it("puts contact and customer-price scopes on a row of their own", () => {
    expect(matrixPlaceOf("supplier:contact:export")).toEqual({
      resource: "supplier:contact",
      action: "export",
    });
    expect(matrixPlaceOf("company:contact:read")).toEqual({
      resource: "company:contact",
      action: "read",
    });
    expect(matrixPlaceOf("product:price:import")).toEqual({
      resource: "product:price",
      action: "import",
    });
  });

  it("keeps every other scope on its resource row", () => {
    expect(matrixPlaceOf("supplier:export")).toEqual({
      resource: "supplier",
      action: "export",
    });
    expect(matrixPlaceOf("sales_order:price:read")).toEqual({
      resource: "sales_order",
      action: "price:read",
    });
    expect(matrixPlaceOf("quotation:approve:step1")).toEqual({
      resource: "quotation",
      action: "approve:step1",
    });
  });
});

describe("matrixCellsOf", () => {
  const column = (action: (typeof MATRIX_ACTIONS)[number]) =>
    MATRIX_ACTIONS.indexOf(action);

  it("gives the product's add / edit box both write halves", () => {
    const cells = matrixCellsOf("product", [
      "product:read",
      "product:write:general",
      "product:write:technical",
      "product:delete",
    ]);
    expect(cells[column("write")]).toEqual([
      "product:write:general",
      "product:write:technical",
    ]);
    expect(cells[column("read")]).toEqual(["product:read"]);
    expect(cells[column("approve")]).toBeNull();
  });

  it("gives a two-step approval's box both steps", () => {
    const cells = matrixCellsOf("quotation", [
      "quotation:read",
      "quotation:approve:step1",
      "quotation:approve:step2",
    ]);
    expect(cells[column("approve")]).toEqual([
      "quotation:approve:step1",
      "quotation:approve:step2",
    ]);
  });

  it("keeps a plain scope alone in its box when the row also has split ones", () => {
    const cells = matrixCellsOf("tooling_order", [
      "tooling_order:write",
      "tooling_order:write:technical",
    ]);
    expect(cells[column("write")]).toEqual(["tooling_order:write"]);
  });

  it("keeps one scope per box everywhere else", () => {
    const cells = matrixCellsOf("supplier", [
      "supplier:read",
      "supplier:write",
    ]);
    expect(cells[column("write")]).toEqual(["supplier:write"]);
  });
});
