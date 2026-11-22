/** Keep in sync with the backend `InstallationStatus`: `planned → in_progress → done`. */
export const INSTALLATION_STATUSES = ["planned", "in_progress", "done"] as const;
export type InstallationStatus = (typeof INSTALLATION_STATUSES)[number];

/** Longest address, person in charge and note the server takes. */
export const SITE_ADDRESS_MAX = 500;
export const PERSON_IN_CHARGE_MAX = 255;
export const INSTALLATION_NOTE_MAX = 2000;

/** An order takes installation while it is in production or already delivered. */
export const INSTALLABLE_ORDER_STATUSES = ["in_production", "delivered"] as const;

export const installationPageRoutes = {
  list: "/delivery/installations",
} as const;

export const installationApiRoutes = {
  list: "/delivery/installations",
  orderInstallation: (orderId: number | string) =>
    `/delivery/orders/${orderId}/installation`,
  one: (id: number | string) => `/delivery/installations/${id}`,
  start: (id: number | string) => `/delivery/installations/${id}/start`,
  finish: (id: number | string) => `/delivery/installations/${id}/finish`,
  photos: (id: number | string) => `/delivery/installations/${id}/photos`,
  photoContent: (photoId: number | string) =>
    `/delivery/installation-photos/${photoId}/content`,
} as const;

export const installationQueryKeys = {
  all: ["installation"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...installationQueryKeys.all, "list", filters] as const,
  order: (orderId: number) =>
    [...installationQueryKeys.all, "order", orderId] as const,
  /** Outside `all`: a step refreshes the lists, never the stored images. */
  photoContent: (photoId: number) => ["installation-photo-content", photoId] as const,
};
