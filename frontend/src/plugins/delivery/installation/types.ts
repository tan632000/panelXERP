import type { InstallationStatus } from "@plugins/delivery/installation/constants";

/** An installation as a list shows it. The server sends no price and no storage key. */
export interface InstallationSummary {
  id: number;
  orderId: number;
  orderCode: string | null;
  customerName: string | null;
  projectName: string | null;
  status: InstallationStatus;
  siteAddress: string | null;
  plannedDate: string | null;
  personInCharge: string | null;
  note: string | null;
  photoCount: number;
  startedAt: string | null;
  doneAt: string | null;
  createdAt: string;
}

export interface InstallationPhoto {
  id: number;
  installationId: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface InstallationDetail extends InstallationSummary {
  photos: InstallationPhoto[];
}

export interface InstallationListParams {
  status?: InstallationStatus;
  orderId?: number;
  page?: number;
  limit?: number;
}

export interface InstallationInput {
  siteAddress?: string;
  plannedDate?: string;
  personInCharge?: string;
  note?: string;
}
