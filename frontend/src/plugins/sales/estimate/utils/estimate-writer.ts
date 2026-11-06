/** The roles that write any estimate besides the request's assigned engineer. */
const ESTIMATE_WRITER_ROLES: readonly string[] = [
  "engineeringLead",
  "director",
];

/**
 * Whether the signed-in user may write an estimate of a request: its assigned engineer, an
 * engineering lead or the director. A permission alone (an administrator's) is not enough —
 * the server answers those writes with 403 or 404, so the controls stay hidden.
 */
export function isEstimateWriter(
  user: { id: number; role?: string | null } | null | undefined,
  assignedEngineerId: number | null | undefined,
): boolean {
  if (!user) return false;
  return (
    (user.role != null && ESTIMATE_WRITER_ROLES.includes(user.role)) ||
    (assignedEngineerId != null && user.id === assignedEngineerId)
  );
}
