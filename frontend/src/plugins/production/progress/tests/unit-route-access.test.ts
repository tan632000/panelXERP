import { describe, expect, it } from "vitest";

import { findNavigationItem } from "@/kernel/core/permissions/route-permissions";

import { ProductionProgressPermission } from "@plugins/production/progress/permissions/progress-permission.keys";

describe("cabinet page access", () => {
  // The module shell grants a page by the menu entry its path falls under; a cabinet page with
  // no entry answers 403 to everyone but an administrator.
  it("puts a cabinet page under an entry any progress reader holds", () => {
    const item = findNavigationItem("production", "/vi/production/units/1258");

    expect(item?.href).toBe("/production/units");
    expect(item?.permissions).toContain(ProductionProgressPermission.read);
    expect(item?.hidden).toBe(true);
  });
});
