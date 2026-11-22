import api from "@/kernel/core/api/api";
import { multipartRequestConfig } from "@/kernel/core/lib/multipart";

import { installationApiRoutes } from "@plugins/delivery/installation/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  InstallationDetail,
  InstallationInput,
  InstallationListParams,
  InstallationPhoto,
  InstallationSummary,
} from "@plugins/delivery/installation/types";

export async function getInstallations(
  params: InstallationListParams = {},
): Promise<PaginatedResponse<InstallationSummary>> {
  const { data } = await api.get<PaginatedResponse<InstallationSummary>>(
    installationApiRoutes.list,
    { params },
  );
  return data;
}

export async function getInstallation(id: number): Promise<InstallationDetail> {
  const { data } = await api.get<InstallationDetail>(
    installationApiRoutes.one(id),
  );
  return data;
}

/** The order's installation with its photos, or null while it has none (an order has at most one). */
export async function getOrderInstallation(
  orderId: number,
): Promise<InstallationDetail | null> {
  const page = await getInstallations({ orderId, limit: 1 });
  const [found] = page.data;
  return found ? getInstallation(found.id) : null;
}

export async function createInstallation(
  orderId: number,
  input: InstallationInput,
): Promise<InstallationDetail> {
  const { data } = await api.post<InstallationDetail>(
    installationApiRoutes.orderInstallation(orderId),
    input,
  );
  return data;
}

export async function startInstallation(id: number): Promise<InstallationDetail> {
  const { data } = await api.post<InstallationDetail>(
    installationApiRoutes.start(id),
    {},
  );
  return data;
}

export async function finishInstallation(
  id: number,
): Promise<InstallationDetail> {
  const { data } = await api.post<InstallationDetail>(
    installationApiRoutes.finish(id),
    {},
  );
  return data;
}

export async function uploadInstallationPhoto(
  id: number,
  file: File,
): Promise<InstallationPhoto> {
  const body = new FormData();
  body.append("file", file);
  const { data } = await api.post<InstallationPhoto>(
    installationApiRoutes.photos(id),
    body,
    multipartRequestConfig(),
  );
  return data;
}

/** The image bytes of a photo; the route needs the caller's token, so an <img src> cannot load it. */
export async function fetchInstallationPhotoContent(
  photoId: number,
): Promise<Blob> {
  const { data } = await api.get<Blob>(
    installationApiRoutes.photoContent(photoId),
    { responseType: "blob" },
  );
  return data;
}
