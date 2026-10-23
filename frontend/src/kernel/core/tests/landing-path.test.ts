import { describe, expect, it } from "vitest";

import {
  LANDING_FALLBACK_PATH,
  getLandingPath,
} from "@/kernel/core/permissions/landing-path";

import type { SidebarSection } from "@/kernel/platform/plugins/navigation.types";

const sections: SidebarSection[] = [
  {
    title: "sectionMasterData",
    items: [
      { href: "/master-data/hidden", icon: "box", label: "h", hidden: true },
      {
        href: "/master-data/customers",
        icon: "box",
        label: "c",
        permissions: ["customer:read"],
      },
    ],
  },
  {
    title: "sidebarSystem",
    items: [
      {
        href: "/system/users",
        icon: "box",
        label: "u",
        permissions: ["user:read"],
      },
    ],
  },
  {
    title: "sidebarWarehouse",
    items: [
      {
        href: "/warehouse/raw-material",
        icon: "box",
        label: "w",
        permissions: ["warehouse:read"],
      },
    ],
  },
];

const grants =
  (...permissions: string[]) =>
  (permission: string) =>
    permissions.includes(permission);

describe("getLandingPath", () => {
  it("opens the first sidebar entry the user holds permission for", () => {
    expect(getLandingPath(grants("customer:read"), sections)).toBe(
      "/master-data/customers",
    );
    expect(getLandingPath(grants("warehouse:read"), sections)).toBe(
      "/warehouse/raw-material",
    );
  });

  it("skips hidden entries and tries system screens last", () => {
    expect(
      getLandingPath(grants("user:read", "warehouse:read"), sections),
    ).toBe("/warehouse/raw-material");
    expect(getLandingPath(grants("user:read"), sections)).toBe("/system/users");
  });

  it("falls back to the profile when nothing is granted", () => {
    expect(getLandingPath(grants(), sections)).toBe(LANDING_FALLBACK_PATH);
  });

  it("sends an administrator to the fallback while no business plugin is enabled", () => {
    // The app navigation holds no business section yet, so even full access lands on the
    // profile; a plugin's first sidebar entry takes over once one is registered.
    expect(getLandingPath(() => true)).toBe(LANDING_FALLBACK_PATH);
  });
});
