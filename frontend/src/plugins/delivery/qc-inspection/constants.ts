/** What a cabinet's QC looks like — keep in sync with the backend `QcUnitStatus`. */
export const QC_UNIT_STATUSES = [
  "waiting",
  "failed",
  "passed",
  "not_ready",
] as const;
export type QcUnitStatus = (typeof QC_UNIT_STATUSES)[number];

export const QC_ITEM_RESULTS = ["pass", "fail", "na"] as const;
export type QcItemResult = (typeof QC_ITEM_RESULTS)[number];

export const QC_DEFECT_STATUSES = ["open", "fixed", "verified"] as const;
export type QcDefectStatus = (typeof QC_DEFECT_STATUSES)[number];

/** Longest note or fix note the server takes. */
export const QC_NOTE_MAX = 1000;

export const qcPageRoutes = {
  list: "/delivery/qc",
  unit: (unitId: number | string) => `/delivery/qc/units/${unitId}`,
  defects: "/delivery/qc/defects",
} as const;

export const qcApiRoutes = {
  units: "/delivery/qc/units",
  unit: (unitId: number | string) => `/delivery/qc/units/${unitId}`,
  rounds: (unitId: number | string) => `/delivery/qc/units/${unitId}/rounds`,
  defects: "/delivery/qc/defects",
  fix: (id: number | string) => `/delivery/qc/defects/${id}/fix`,
  verify: (id: number | string) => `/delivery/qc/defects/${id}/verify`,
  itemPhotos: (roundItemId: number | string) =>
    `/delivery/qc/round-items/${roundItemId}/photos`,
  photoContent: (photoId: number | string) =>
    `/delivery/qc/photos/${photoId}/content`,
} as const;

export const qcQueryKeys = {
  all: ["qc-inspection"] as const,
  units: (filters?: Record<string, unknown>) =>
    [...qcQueryKeys.all, "units", filters] as const,
  unit: (unitId: number) => [...qcQueryKeys.all, "unit", unitId] as const,
  defects: (filters?: Record<string, unknown>) =>
    [...qcQueryKeys.all, "defects", filters] as const,
  /** Outside `all`: a round or a fix refreshes the lists, never the stored images. */
  photoContent: (photoId: number) => ["qc-photo-content", photoId] as const,
};
