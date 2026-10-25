/** The role that writes any estimate besides the request's assigned engineer. */
export const ESTIMATE_LEAD_ROLE = "engineeringLead";

/**
 * Whether the signed-in user may write an estimate of a request: its assigned engineer or an
 * engineering lead. A permission alone (a director's or an administrator's) is not enough —
 * the server answers those writes with 403 or 404, so the controls stay hidden.
 */
export function isEstimateWriter(
  user: { id: number; role?: string | null } | null | undefined,
  assignedEngineerId: number | null | undefined,
): boolean {
  if (!user) return false;
  return (
    user.role === ESTIMATE_LEAD_ROLE ||
    (assignedEngineerId != null && user.id === assignedEngineerId)
  );
}
