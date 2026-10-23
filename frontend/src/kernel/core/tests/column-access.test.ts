import { describe, expect, it } from "vitest";

import { accessibleColumns } from "@/kernel/core/lib/column-access";

/**
 * The base for field-level access: a column may declare the scope needed to see it, and the
 * settings popup is built from what survives this filter rather than from the full list.
 *
 * No column declares one yet, so today every account sees every column — these cases prove
 * the wiring is in place for when those scopes are issued.
 */
describe("accessibleColumns", () => {
  const GOODS_RECEIPT_COLUMNS = [
    { key: "receiptCode" },
    { key: "supplier" },
    { key: "quantity" },
    { key: "unitPrice", permission: "goods_receipt:read:price" },
    { key: "amount", permission: "goods_receipt:read:price" },
  ];

  const holding =
    (...scopes: string[]) =>
    (permission: string) =>
      scopes.includes(permission);

  it("keeps a column that declares no permission", () => {
    const columns = accessibleColumns(GOODS_RECEIPT_COLUMNS, holding());

    expect(columns.map((column) => column.key)).toEqual([
      "receiptCode",
      "supplier",
      "quantity",
    ]);
  });

  it("adds the guarded columns once the account holds the scope", () => {
    const columns = accessibleColumns(
      GOODS_RECEIPT_COLUMNS,
      holding("goods_receipt:read:price"),
    );

    expect(columns.map((column) => column.key)).toEqual([
      "receiptCode",
      "supplier",
      "quantity",
      "unitPrice",
      "amount",
    ]);
  });

  /**
   * The popup is built from the accessible columns, so a scope the account lacks removes the
   * column from the choice rather than offering a control that reveals nothing.
   */
  it("offers the settings popup only what the account may see", () => {
    const warehouse = accessibleColumns(GOODS_RECEIPT_COLUMNS, holding());
    const purchasing = accessibleColumns(
      GOODS_RECEIPT_COLUMNS,
      holding("goods_receipt:read:price"),
    );

    expect(warehouse).toHaveLength(3);
    expect(purchasing).toHaveLength(5);
    expect(warehouse.some((column) => column.key === "unitPrice")).toBe(false);
  });

  /**
   * `useListColumnPreferences` intersects the stored keys with the ones it is given, so
   * passing the accessible list is what stops a stale choice from restoring a lost column.
   */
  it("cannot be re-added by a stored preference naming it", () => {
    const readable = accessibleColumns(GOODS_RECEIPT_COLUMNS, holding());
    const stored = ["receiptCode", "unitPrice", "amount"];

    const restored = readable
      .map((column) => column.key)
      .filter((key) => stored.includes(key));

    expect(restored).toEqual(["receiptCode"]);
  });

  it("preserves the order the table declares", () => {
    const columns = accessibleColumns(
      [{ key: "b" }, { key: "a" }, { key: "c", permission: "x" }],
      holding("x"),
    );

    expect(columns.map((column) => column.key)).toEqual(["b", "a", "c"]);
  });
});
