"use client";

import { useMemo } from "react";

import { includesFolded } from "@/kernel/core/lib/search-text";

import { usePermissionLabels } from "@plugins/system/roles/hooks/usePermissionLabels";
import { usePermissionOrder } from "@plugins/system/roles/hooks/usePermissionOrder";

import type { PermissionGroup } from "@plugins/system/roles/types";

/**
 * The columns of the matrix, in the order an administrator reads them.
 *
 * Read, write and delete appear on nearly every resource, and every list screen carries its
 * own Excel export and import scope, so each earns a column, as do approve, cancel and the
 * three kinds of printing: the PDF printout, labels and QR codes.
 * Everything rarer stays in the trailing cell rather than adding a column that would be empty
 * on most rows.
 */
export const MATRIX_ACTIONS = [
  "read",
  "write",
  "delete",
  "approve",
  "cancel",
  "export",
  "import",
  "print",
  "label",
  "lot_qr",
] as const;

/** The action half of a permission: `product:price:write` → `price:write`. */
export function actionOf(permission: string): string {
  return permission.split(":").slice(1).join(":");
}

/**
 * Sub-resources that get a matrix row of their own instead of crowding their parent's
 * "other" cell: a customer's or supplier's contacts and a product's customer prices each
 * carry their own read/write/export/import scopes, which belong under the matrix columns.
 */
const SUB_RESOURCES: Readonly<Record<string, readonly string[]>> = {
  company: ["contact"],
  supplier: ["contact"],
  product: ["price"],
};

/** The matrix row a permission sits on and its action within that row. */
export function matrixPlaceOf(permission: string): {
  resource: string;
  action: string;
} {
  const [resource, sub, ...rest] = permission.split(":");
  if (rest.length > 0 && SUB_RESOURCES[resource]?.includes(sub)) {
    return { resource: `${resource}:${sub}`, action: rest.join(":") };
  }
  return { resource, action: actionOf(permission) };
}

/**
 * The boxes of one matrix row, column by column, from the scopes the row holds.
 *
 * A row may hold no plain scope for a column, only its split halves: a product's or an RFQ's
 * general and technical writes, a two-step approval, a scrap's manager and QC approvals. That
 * column's box then stands for every half, so ticking it grants the whole action, while each
 * half stays tickable on its own in the trailing cell for a role that needs only one.
 */
export function matrixCellsOf(
  resource: string,
  permissions: readonly string[],
): Array<string[] | null> {
  const byAction = new Map(
    permissions.map((permission) => [
      matrixPlaceOf(permission).action,
      permission,
    ]),
  );
  return MATRIX_ACTIONS.map((action) => {
    const permission = byAction.get(action);
    if (permission) return [permission];
    const halves = permissions.filter((scope) =>
      matrixPlaceOf(scope).action.startsWith(`${action}:`),
    );
    return halves.length > 0 ? halves : null;
  });
}

export interface PermissionMatrixRow {
  module: string;
  resource: string;
  label: string;
  permissions: string[];
  /**
   * One entry per column: the scopes its box ticks (usually one), `null` where the resource
   * has no such scope at all.
   */
  cells: Array<string[] | null>;
  /** Scopes too rare for a column of their own. */
  extras: string[];
}

export interface PermissionMatrixBlock {
  module: string;
  rows: PermissionMatrixRow[];
}

/**
 * Turns the permission catalogue into the rows of the assignment matrix: filtered by the
 * search, ordered the way the Function List reads, and cut into module bands.
 */
export function usePermissionMatrix({
  catalog,
  search,
  rolePermissions,
}: {
  catalog: PermissionGroup[];
  search: string;
  rolePermissions: string[];
}) {
  const { moduleLabel, resourceLabel, permissionLabel } = usePermissionLabels();
  const { moduleRank, resourceRank } = usePermissionOrder();

  const rows = useMemo<PermissionMatrixRow[]>(() => {
    const keyword = search.trim().toLowerCase();

    return catalog
      .flatMap((group) => {
        // One row per resource, and one per sub-resource split off it.
        const byRow = new Map<string, string[]>();
        for (const permission of group.permissions) {
          const { resource } = matrixPlaceOf(permission);
          byRow.set(resource, [...(byRow.get(resource) ?? []), permission]);
        }
        return [...byRow.entries()].map(([resource, permissions]) => {
          return {
            module: group.module,
            resource,
            label: resourceLabel(resource),
            permissions,
            cells: matrixCellsOf(resource, permissions),
            extras: permissions.filter(
              (permission) =>
                !(MATRIX_ACTIONS as readonly string[]).includes(
                  matrixPlaceOf(permission).action,
                ),
            ),
          };
        });
      })
      .filter((row) => {
        if (!keyword) return true;
        return (
          includesFolded(row.label, keyword) ||
          includesFolded(moduleLabel(row.module), keyword) ||
          row.permissions.some((permission) =>
            includesFolded(permissionLabel(permission), keyword),
          )
        );
      })
      .sort(
        (a, b) =>
          moduleRank(a.module) - moduleRank(b.module) ||
          // A split-off sub-resource ranks with its parent and follows it.
          resourceRank(a.resource.split(":")[0]) -
            resourceRank(b.resource.split(":")[0]) ||
          a.resource.split(":")[0].localeCompare(b.resource.split(":")[0]) ||
          Number(a.resource.includes(":")) - Number(b.resource.includes(":")) ||
          a.label.localeCompare(b.label),
      );
  }, [
    catalog,
    search,
    moduleLabel,
    resourceLabel,
    permissionLabel,
    moduleRank,
    resourceRank,
  ]);

  /** The same rows, cut into the modules of the Function List for the banded table. */
  const blocks = useMemo<PermissionMatrixBlock[]>(() => {
    const grouped: PermissionMatrixBlock[] = [];
    for (const row of rows) {
      const last = grouped.at(-1);
      if (last && last.module === row.module) last.rows.push(row);
      else grouped.push({ module: row.module, rows: [row] });
    }
    return grouped;
  }, [rows]);

  /** The modules the role grants nothing in — the ones folded until told otherwise. */
  const emptyModules = useMemo(() => {
    const granted = new Set(rolePermissions);
    const withGrants = new Set(
      catalog
        .filter((group) =>
          group.permissions.some((permission) => granted.has(permission)),
        )
        .map((group) => group.module),
    );
    return new Set(
      catalog
        .map((group) => group.module)
        .filter((module) => !withGrants.has(module)),
    );
  }, [catalog, rolePermissions]);

  return { rows, blocks, emptyModules };
}
