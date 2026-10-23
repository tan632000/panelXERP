/**
 * Which columns of a list an account may see at all.
 *
 * Distinct from the show/hide choice: hiding is the reader's preference and reversible from
 * the settings popup, while this decides whether the column is offered there in the first
 * place. A warehouse account allowed five fields of a goods receipt customises those five;
 * purchasing customises all ten. Both use the same popup.
 *
 * Field-level scopes are not issued yet, so a column that declares no `permission` is
 * readable by anyone who can open the list — which is every column today. Declaring one is
 * how a feature opts in once those scopes exist.
 *
 * This is presentation only. Filtering a column here removes it from the screen, not from
 * the response: the route guard and the service remain the authority on what an account may
 * read, exactly as with the action controls.
 */
export interface AccessControlledColumn {
  key: string;
  /** Scope required to see this column. Absent means the list's own read scope is enough. */
  permission?: string;
}

export function accessibleColumns<T extends AccessControlledColumn>(
  columns: readonly T[],
  can: (permission: string) => boolean,
): T[] {
  return columns.filter(
    (column) => !column.permission || can(column.permission),
  );
}
