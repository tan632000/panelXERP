/** The six stages of a cabinet, in the order they run — keep in sync with the backend enum. */
export const PRODUCTION_STAGES = [
  "material_prep",
  "enclosure",
  "device_mounting",
  "wiring",
  "internal_test",
  "finishing",
] as const;
export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

export const STAGE_STATUSES = ["pending", "in_progress", "done"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];
export type StageAction = "start" | "finish" | "undo";

export const progressPageRoutes = {
  myUnits: "/production/my-units",
  unit: (id: number | string) => `/production/units/${id}`,
} as const;

export const progressApiRoutes = {
  list: "/production/units",
  detail: (id: number | string) => `/production/units/${id}`,
  stage: (id: number | string, stage: ProductionStage, action: StageAction) =>
    `/production/units/${id}/stages/${stage}/${action}`,
  photos: (id: number | string) => `/production/units/${id}/photos`,
  photoContent: (photoId: number | string) =>
    `/production/photos/${photoId}/content`,
} as const;

export const progressQueryKeys = {
  all: ["production-units"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...progressQueryKeys.all, "list", filters] as const,
  detail: (id: number) => [...progressQueryKeys.all, "detail", id] as const,
  photos: (id: number) => [...progressQueryKeys.all, "photos", id] as const,
  /** Outside `all`: a stage change refreshes the lists, never the stored images. */
  photoContent: (photoId: number) =>
    ["production-photo-content", photoId] as const,
};

/** What the photo picker offers; the server repeats the check and reads the content. */
export const PHOTO_ACCEPT = ".png,.jpg,.jpeg";
export const PHOTO_EXTENSIONS = ["png", "jpg", "jpeg"] as const;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_MAX_COUNT = 30;
