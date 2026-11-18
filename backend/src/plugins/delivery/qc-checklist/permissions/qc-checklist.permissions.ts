export const QC_CHECKLIST_READ = 'qc_checklist:read' as const;
/** Add, rename, hide/show and reorder items: production managers. */
export const QC_CHECKLIST_MANAGE = 'qc_checklist:manage' as const;

export const qcChecklistPermissions = [
  QC_CHECKLIST_READ,
  QC_CHECKLIST_MANAGE,
] as const;
