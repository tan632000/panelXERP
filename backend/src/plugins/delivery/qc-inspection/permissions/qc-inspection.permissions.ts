export const QC_INSPECTION_READ = 'qc_inspection:read' as const;
/** Record a QC round: QC inspectors and production managers. */
export const QC_INSPECTION_CREATE = 'qc_inspection:create' as const;
/** Mark a defect fixed: production managers. */
export const QC_INSPECTION_FIX = 'qc_inspection:fix' as const;
/** Verify a fixed defect: QC inspectors and production managers, never the one who fixed it. */
export const QC_INSPECTION_VERIFY = 'qc_inspection:verify' as const;

export const qcInspectionPermissions = [
  QC_INSPECTION_READ,
  QC_INSPECTION_CREATE,
  QC_INSPECTION_FIX,
  QC_INSPECTION_VERIFY,
] as const;
