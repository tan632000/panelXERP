/**
 * QC inspection permission keys — keep in sync with backend qc-inspection.permissions.ts.
 */
export const QcInspectionPermission = {
  read: "qc_inspection:read",
  create: "qc_inspection:create",
  fix: "qc_inspection:fix",
  verify: "qc_inspection:verify",
} as const;
