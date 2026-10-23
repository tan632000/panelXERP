import { describe, expect, it } from "vitest";

import {
  resolvePinnedEntries,
  searchSidebarNav,
  type SidebarNavGroup,
} from "@/kernel/core/components/layout/sidebar-nav";
import { foldSearchText } from "@/kernel/core/lib/search-text";

const entry = (
  groupKey: string,
  groupTitle: string,
  href: string,
  label: string,
) => ({
  href,
  label,
  active: false,
  groupKey,
  groupTitle,
});

const groups: SidebarNavGroup[] = [
  {
    key: "sidebarSales",
    title: "Bán hàng",
    shortTitle: "Bán hàng",
    icon: "shopping-cart",
    active: false,
    items: [
      entry("sidebarSales", "Bán hàng", "/sales/order", "Đơn hàng (SO)"),
      entry("sidebarSales", "Bán hàng", "/sales/quotation", "Báo giá"),
    ],
  },
  {
    key: "sidebarWarehouse",
    title: "Kho",
    shortTitle: "Kho",
    icon: "building-warehouse",
    active: true,
    items: [
      entry("sidebarWarehouse", "Kho", "/warehouse/raw-material", "Kho NVL"),
      entry("sidebarWarehouse", "Kho", "/warehouse/finished-product", "Kho TP"),
    ],
  },
];

describe("sidebar navigation helpers", () => {
  it("folds Vietnamese diacritics without shifting character positions", () => {
    expect(foldSearchText("Đơn hàng")).toBe("don hang");
    expect(foldSearchText("Đơn hàng")).toHaveLength(
      Array.from("Đơn hàng").length,
    );
  });

  it("finds functions typed without accents and splits the label around the match", () => {
    const hits = searchSidebarNav(groups, "don hang");

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      before: "",
      match: "Đơn hàng",
      after: " (SO)",
      entry: { href: "/sales/order", groupTitle: "Bán hàng" },
    });
  });

  it("lists every match across modules and nothing for a blank query", () => {
    expect(
      searchSidebarNav(groups, "kho").map((hit) => hit.entry.href),
    ).toEqual(["/warehouse/raw-material", "/warehouse/finished-product"]);
    expect(searchSidebarNav(groups, "   ")).toEqual([]);
  });

  it("keeps pins in pinned order and drops ones the user can no longer open", () => {
    const pinned = resolvePinnedEntries(groups, [
      "/warehouse/raw-material",
      "/system/users",
      "/sales/order",
    ]);

    expect(pinned.map((item) => item.href)).toEqual([
      "/warehouse/raw-material",
      "/sales/order",
    ]);
  });
});
