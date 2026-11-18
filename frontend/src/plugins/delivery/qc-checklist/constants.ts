/** Longest item name the server takes. */
export const QC_CHECKLIST_NAME_MAX = 200;

export const qcChecklistApiRoutes = {
  list: "/delivery/qc/checklist-items",
  item: (id: number | string) => `/delivery/qc/checklist-items/${id}`,
  order: "/delivery/qc/checklist-items/order",
} as const;

export const qcChecklistQueryKeys = {
  all: ["qc-checklist"] as const,
  list: (includeHidden: boolean) =>
    [...qcChecklistQueryKeys.all, "list", includeHidden] as const,
};
