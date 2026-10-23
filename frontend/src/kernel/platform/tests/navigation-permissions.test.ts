import { describe, expect, it, vi } from "vitest";

import { hasPermission } from "@/kernel/core/auth/tokens";
import {
  findNavigationItem,
  normalizeModulePath,
} from "@/kernel/core/permissions/route-permissions";
import { navigationConfig } from "@/kernel/platform/plugins/navigation.registry";

import type { SidebarItemConfig } from "@/kernel/platform/plugins/navigation.types";

// The build ships no business plugin yet; a fixture menu exercises the real route matching.
vi.mock("@/kernel/platform/plugins/navigation.registry", () => ({
  navigationConfig: {
    crm: {
      moduleName: "crm",
      sections: [
        {
          title: "sidebarCrm",
          items: [
            {
              href: "/crm/customers",
              icon: "users",
              label: "customers",
              permissions: ["customer:read"],
            },
          ],
        },
      ],
    },
    catalog: {
      moduleName: "catalog",
      sections: [
        {
          title: "sidebarCatalog",
          items: [
            {
              href: "/catalog/item",
              icon: "box",
              label: "items",
              permissions: ["item:read"],
            },
            {
              href: "/catalog/item-group",
              icon: "box",
              label: "itemGroups",
              permissions: ["item_group:read"],
            },
            { href: "/catalog/help", icon: "info", label: "help" },
          ],
        },
      ],
    },
  },
}));

function canViewSidebarItem(
  permissions: string[],
  item: SidebarItemConfig,
): boolean {
  if (!item.permissions || item.permissions.length === 0) return true;
  return item.permissions.some((perm) => hasPermission(permissions, perm));
}

function canAccessRoute(permissions: string[], pathname: string): boolean {
  for (const moduleKey of Object.keys(navigationConfig)) {
    const item = findNavigationItem(moduleKey, pathname);
    if (item) return canViewSidebarItem(permissions, item);
  }
  return false;
}

describe("route permissions", () => {
  it("normalizes localized route paths", () => {
    expect(normalizeModulePath("/vi/crm/customers/")).toBe("/crm/customers");
    expect(normalizeModulePath("/en/catalog/item")).toBe("/catalog/item");
    expect(normalizeModulePath("/vi")).toBe("/");
  });

  it("blocks direct URL access without page permission", () => {
    expect(canAccessRoute(["item:read"], "/vi/crm/customers")).toBe(false);
    expect(canAccessRoute(["customer:read"], "/vi/crm/customers")).toBe(true);
  });

  it("allows nested detail routes with the list permission", () => {
    expect(canAccessRoute(["customer:read"], "/vi/crm/customers/12")).toBe(
      true,
    );
    expect(
      canAccessRoute(["customer:read"], "/vi/crm/customers/contacts/4"),
    ).toBe(true);
  });

  it("resolves a route to the longest matching entry, not a shorter prefix", () => {
    // `/catalog/item-group` starts with `/catalog/item`; it must still gate on its own scope.
    expect(canAccessRoute(["item:read"], "/vi/catalog/item-group/3")).toBe(
      false,
    );
    expect(
      canAccessRoute(["item_group:read"], "/vi/catalog/item-group/3"),
    ).toBe(true);
  });

  it("honours module and full wildcards", () => {
    expect(canAccessRoute(["customer:*"], "/vi/crm/customers")).toBe(true);
    expect(canAccessRoute(["*:*"], "/vi/catalog/item-group")).toBe(true);
  });

  it("opens an entry that names no permission to everyone", () => {
    expect(canAccessRoute([], "/vi/catalog/help")).toBe(true);
  });

  it("denies a route no menu entry declares", () => {
    expect(canAccessRoute(["*:*"], "/vi/unknown/page")).toBe(false);
  });
});
