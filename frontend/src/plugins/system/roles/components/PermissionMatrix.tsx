"use client";

import { useTranslations } from "next-intl";
import { Fragment } from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { cn } from "@/kernel/core/lib/cn";

import { usePermissionLabels } from "@plugins/system/roles/hooks/usePermissionLabels";
import {
  MATRIX_ACTIONS,
  matrixPlaceOf,
  type PermissionMatrixBlock,
} from "@plugins/system/roles/hooks/usePermissionMatrix";

import { TriStateCheckbox } from "./TriStateCheckbox";

/**
 * The band a row sits on.
 *
 * Ninety rows of checkboxes need a stronger cue than a hairline, so the rows alternate; a row
 * the role already grants something in keeps its own tint over the band. The sticky first
 * cell repeats whatever this returns, or it would float over the row it belongs to.
 */
function backgroundOf(granted: boolean, rowIndex: number): string {
  if (granted) return "bg-brand-50/40";
  return rowIndex % 2 === 1 ? "bg-surface-secondary/50" : "bg-surface-primary";
}

export interface PermissionMatrixProps {
  blocks: PermissionMatrixBlock[];
  selected: Set<string>;
  /** Modules currently folded shut; a search opens every match regardless. */
  isModuleOpen: (module: string) => boolean;
  /** Absent while a search is running — a fold must not hide what it matched. */
  onToggleModule?: (module: string) => void;
  onToggle: (permission: string) => void;
  onToggleMany: (permissions: string[], checked: boolean) => void;
}

/**
 * Every function of the system against the actions it allows: one row per function, one
 * column per action, a tick where the role holds that scope.
 *
 * Reading a role off ninety-odd separate lists is what this replaces, so the table earns its
 * totals: per module, per row, per column, and one for the whole catalogue underneath.
 */
export function PermissionMatrix({
  blocks,
  selected,
  isModuleOpen,
  onToggleModule,
  onToggle,
  onToggleMany,
}: PermissionMatrixProps) {
  const t = useTranslations("system.roles");
  const {
    moduleLabel,
    actionLabel,
    scopeLabel,
    hasScopeLabel,
    permissionLabel,
  } = usePermissionLabels();

  const rows = blocks.flatMap((block) => block.rows);
  const countOf = (permissions: string[]) =>
    permissions.filter((permission) => selected.has(permission)).length;

  /** One column of the matrix, over the rows the search is currently showing. */
  const columnScopes = (index: number) =>
    rows.flatMap((row) => row.cells[index] ?? []);

  return (
    <div className="scrollbar-thin max-h-[68vh] overflow-auto rounded-lg border border-border-secondary">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-20">
          <tr className="bg-surface-secondary">
            <th className="sticky left-0 z-30 min-w-[240px] border-b border-r border-border-secondary bg-surface-secondary px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-text-tertiary">
              {t("permissionResource")}
            </th>
            {MATRIX_ACTIONS.map((action, index) => {
              const scopes = columnScopes(index);
              const granted = countOf(scopes);
              return (
                <th
                  key={action}
                  className="w-[84px] border-b border-border-secondary px-1.5 py-2 text-center"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-bold text-text-primary">
                      {actionLabel(action)}
                    </span>
                    {/* Ticks the column across every row the search is showing. */}
                    <TriStateCheckbox
                      ariaLabel={actionLabel(action)}
                      checked={scopes.length > 0 && granted === scopes.length}
                      indeterminate={granted > 0}
                      disabled={scopes.length === 0}
                      onChange={() =>
                        onToggleMany(scopes, granted !== scopes.length)
                      }
                    />
                  </div>
                </th>
              );
            })}
            <th className="min-w-[260px] border-b border-l border-border-secondary px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-text-tertiary">
              {t("otherPermissions")}
            </th>
          </tr>
        </thead>

        <tbody>
          {blocks.map((block, blockIndex) => {
            const blockScopes = block.rows.flatMap((row) => row.permissions);
            const blockGranted = countOf(blockScopes);
            const expanded = isModuleOpen(block.module);

            return (
              <Fragment key={block.module}>
                {/* A gap between modules: banded rows running straight into the next
                    module's read as one list, and the reader loses where they are. */}
                {blockIndex > 0 && (
                  <tr aria-hidden>
                    <td
                      colSpan={MATRIX_ACTIONS.length + 2}
                      className="h-3 bg-surface-tertiary p-0"
                    />
                  </tr>
                )}

                <tr className="bg-surface-secondary">
                  <th
                    scope="colgroup"
                    colSpan={MATRIX_ACTIONS.length + 2}
                    className="sticky left-0 border-y-2 border-border-secondary px-3 py-2 text-left"
                  >
                    <span className="flex items-center gap-2">
                      <TriStateCheckbox
                        ariaLabel={moduleLabel(block.module)}
                        checked={blockGranted === blockScopes.length}
                        indeterminate={blockGranted > 0}
                        onChange={() =>
                          onToggleMany(
                            blockScopes,
                            blockGranted !== blockScopes.length,
                          )
                        }
                      />
                      {/* The whole caption folds the module; the checkbox beside it stays a
                          checkbox, so neither steals the other's click. */}
                      <button
                        type="button"
                        onClick={() => onToggleModule?.(block.module)}
                        aria-expanded={expanded}
                        disabled={!onToggleModule}
                        className="flex flex-1 cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left [font-family:inherit] disabled:cursor-default"
                      >
                        <span className="text-xs font-bold uppercase tracking-wide text-text-secondary">
                          {moduleLabel(block.module)}
                        </span>
                        <span className="rounded-full bg-surface-primary px-2 py-0.5 text-[11px] font-semibold text-text-tertiary">
                          {blockGranted}/{blockScopes.length}
                        </span>
                        {!expanded && (
                          <span className="text-[11px] text-text-tertiary">
                            {t("collapsedRows", { count: block.rows.length })}
                          </span>
                        )}
                        <Icon
                          name={expanded ? "chevron-up" : "chevron-down"}
                          size={16}
                          className="ml-auto shrink-0 text-text-tertiary"
                        />
                      </button>
                    </span>
                  </th>
                </tr>

                {expanded &&
                  block.rows.map((row, rowIndex) => {
                    const granted = countOf(row.permissions);
                    const rowBackground = backgroundOf(granted > 0, rowIndex);

                    return (
                      <tr
                        key={row.resource}
                        className={cn(
                          "border-b border-border-secondary transition-colors hover:bg-brand-50/60",
                          rowBackground,
                        )}
                      >
                        <th
                          scope="row"
                          className={cn(
                            "sticky left-0 z-10 border-r-2 border-border-secondary px-3 py-2 text-left font-medium",
                            rowBackground,
                          )}
                        >
                          <span className="flex items-center gap-2">
                            {/* The row's own master: everything this function grants. */}
                            <TriStateCheckbox
                              ariaLabel={row.label}
                              checked={granted === row.permissions.length}
                              indeterminate={granted > 0}
                              onChange={() =>
                                onToggleMany(
                                  row.permissions,
                                  granted !== row.permissions.length,
                                )
                              }
                            />
                            <span className="truncate text-text-primary">
                              {row.label}
                            </span>
                          </span>
                        </th>

                        {row.cells.map((scopes, index) => {
                          if (!scopes) {
                            return (
                              <td
                                key={MATRIX_ACTIONS[index]}
                                className="border-l border-border-secondary px-2 py-2 text-center"
                              >
                                {/* No such scope on this function — an empty cell rather than
                                    an unticked one, so nobody looks for a right that cannot
                                    exist. */}
                                <span className="text-text-tertiary/50">—</span>
                              </td>
                            );
                          }
                          const cellGranted = countOf(scopes);
                          const label = scopes.map(permissionLabel).join("\n");
                          // A box standing for several scopes explains which ones it ticks.
                          let hint: string | null = null;
                          if (scopes.length > 1) {
                            hint = scopes
                              .map((scope) =>
                                scopeLabel(scope, matrixPlaceOf(scope).action),
                              )
                              .join("\n");
                          } else if (hasScopeLabel(scopes[0])) {
                            hint = scopeLabel(scopes[0], "");
                          }
                          return (
                            <td
                              key={MATRIX_ACTIONS[index]}
                              className="border-l border-border-secondary px-2 py-2 text-center"
                            >
                              {/* The hint floats beside the box so every checkbox of a column
                                  stays on the same vertical line. */}
                              <span className="relative inline-flex align-middle">
                                <TriStateCheckbox
                                  ariaLabel={label}
                                  title={label}
                                  checked={cellGranted === scopes.length}
                                  indeterminate={cellGranted > 0}
                                  onChange={() =>
                                    scopes.length === 1
                                      ? onToggle(scopes[0])
                                      : onToggleMany(
                                          scopes,
                                          cellGranted !== scopes.length,
                                        )
                                  }
                                />
                                {/* A scope that means more than its column header — warehouse
                                    `approve` signs off a stocktake adjustment — explains itself
                                    on hover rather than crowding the cell. */}
                                {hint && (
                                  <span
                                    title={hint}
                                    className="absolute inline-flex cursor-help text-text-tertiary"
                                    style={{
                                      left: "calc(100% + 4px)",
                                      top: "50%",
                                      transform: "translateY(-50%)",
                                    }}
                                  >
                                    <Icon name="info" size={12} />
                                  </span>
                                )}
                              </span>
                            </td>
                          );
                        })}

                        <td className="border-l-2 border-border-secondary px-3 py-1.5">
                          {row.extras.length === 0 ? (
                            <span className="text-text-tertiary/50">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {row.extras.map((permission) => {
                                const isOn = selected.has(permission);
                                return (
                                  <label
                                    key={permission}
                                    title={permissionLabel(permission)}
                                    className={cn(
                                      "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors",
                                      isOn
                                        ? "border-brand bg-brand-light font-semibold text-brand"
                                        : "border-border-secondary text-text-secondary hover:bg-surface-secondary",
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      className="size-3 cursor-pointer accent-brand"
                                      checked={isOn}
                                      onChange={() => onToggle(permission)}
                                    />
                                    {scopeLabel(
                                      permission,
                                      matrixPlaceOf(permission).action,
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </Fragment>
            );
          })}
        </tbody>

        <tfoot className="sticky bottom-0 z-20">
          <tr className="bg-surface-secondary">
            <th className="sticky left-0 z-30 border-r border-t border-border-secondary bg-surface-secondary px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-text-tertiary">
              {t("permissionTotal")}
            </th>
            {MATRIX_ACTIONS.map((action, index) => (
              <td
                key={action}
                className="border-l border-t border-border-secondary px-2 py-2 text-center text-sm font-bold text-text-primary"
              >
                {countOf(columnScopes(index))}
              </td>
            ))}
            <td className="border-l border-t border-border-secondary px-3 py-2 text-sm font-bold text-text-primary">
              {countOf(rows.flatMap((row) => row.extras))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
