/** Longest representative name the server takes. */
export const REPRESENTATIVE_NAME_MAX = 255;

/** Signed minutes: 1 to 10 files; the types and the size limit are the handover minutes' own. */
export const ACCEPTANCE_FILE_MAX_COUNT = 10;

export const acceptanceApiRoutes = {
  order: (orderId: number | string) => `/delivery/orders/${orderId}/acceptance`,
  fileContent: (fileId: number | string) =>
    `/delivery/acceptance-files/${fileId}/content`,
} as const;

export const acceptanceQueryKeys = {
  all: ["acceptance"] as const,
  order: (orderId: number) =>
    [...acceptanceQueryKeys.all, "order", orderId] as const,
};
