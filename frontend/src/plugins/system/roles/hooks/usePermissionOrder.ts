"use client";

import { useMemo } from "react";

import { appNavigationSections } from "@kernel/platform/plugins/navigation.registry";

/**
 * Module order of the Function List (16-09), which is also the order the sidebar and the
 * customer mock read in. `other-revenue` and the kernel scopes are not modules of that list,
 * so they close the table rather than interleaving with the ones that are.
 */
const MODULE_ORDER = [
  "master-data",
  "sales",
  "plans",
  "procurement",
  "qc-lab",
  "warehouse",
  "production",
  "delivery",
  "maintenance",
  // The reports are declared by the sales plugin but are a module of their own (FL 11.x).
  "reports",
  "other-revenue",
  "kernel",
];

/**
 * How the permission matrix orders its rows.
 *
 * Within a module the order is the navigation's own — every feature registers its sidebar
 * entry with the permissions it guards, and that navigation already mirrors the mock and the
 * Function List. Reading it here keeps the two in step without a second hand-kept list; a
 * scope no menu entry guards (a report, an attachment) simply follows the ones that do.
 */
export function usePermissionOrder() {
  return useMemo(() => {
    const resourceRank = new Map<string, number>();
    let rank = 0;

    for (const section of appNavigationSections) {
      for (const item of section.items) {
        for (const permission of item.permissions ?? []) {
          const resource = permission.split(":")[0];
          if (!resourceRank.has(resource)) resourceRank.set(resource, rank++);
        }
      }
    }

    return {
      moduleRank: (module: string) => {
        const index = MODULE_ORDER.indexOf(module);
        return index === -1 ? MODULE_ORDER.length : index;
      },
      resourceRank: (resource: string) =>
        resourceRank.get(resource) ?? Number.MAX_SAFE_INTEGER,
    };
  }, []);
}
