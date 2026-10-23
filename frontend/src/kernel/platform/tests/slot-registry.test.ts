import { describe, expect, it } from "vitest";

import { groupContributionsBySlot } from "@kernel/platform/plugins/slot.registry";

import type { ErpFrontendPlugin } from "@kernel/platform/plugins/plugin.contract";
import type { AnySlotContribution } from "@kernel/platform/plugins/slot.types";

function contribution(
  slot: string,
  id: string,
  order?: number,
): AnySlotContribution {
  return { slot, id, order, Component: () => null };
}

function plugin(key: string, slots: AnySlotContribution[]): ErpFrontendPlugin {
  return {
    key,
    name: key,
    navigationModuleKey: "sales",
    navigation: { moduleName: key, sections: [] },
    slots,
  };
}

describe("groupContributionsBySlot", () => {
  it("groups contributions from several plugins under one slot", () => {
    const grouped = groupContributionsBySlot([
      plugin("master-data", [contribution("order.form.afterLines", "md")]),
      plugin("sales", [contribution("order.form.afterLines", "sl")]),
    ]);

    expect(grouped["order.form.afterLines"].map((item) => item.id)).toEqual([
      "md",
      "sl",
    ]);
  });

  it("orders by `order` and breaks ties on id, not plugin order", () => {
    const grouped = groupContributionsBySlot([
      plugin("sales", [
        contribution("s", "zebra", 10),
        contribution("s", "alpha", 10),
      ]),
      plugin("master-data", [contribution("s", "first", 1)]),
    ]);

    expect(grouped.s.map((item) => item.id)).toEqual([
      "first",
      "alpha",
      "zebra",
    ]);
  });

  it("treats a missing order as 0", () => {
    const grouped = groupContributionsBySlot([
      plugin("sales", [contribution("s", "b", 5), contribution("s", "a")]),
    ]);

    expect(grouped.s.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("rejects two contributions claiming the same id in one slot", () => {
    expect(() =>
      groupContributionsBySlot([
        plugin("master-data", [contribution("s", "same")]),
        plugin("sales", [contribution("s", "same")]),
      ]),
    ).toThrow(/Duplicate slot contribution "same"/);
  });

  it("allows the same id in two different slots", () => {
    const grouped = groupContributionsBySlot([
      plugin("md", [contribution("a", "panel"), contribution("b", "panel")]),
    ]);

    expect(Object.keys(grouped).sort()).toEqual(["a", "b"]);
  });

  it("ignores a plugin that contributes nothing", () => {
    expect(groupContributionsBySlot([plugin("sales", [])])).toEqual({});
  });
});
