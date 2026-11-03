import api from "@/kernel/core/api/api";
import { multipartRequestConfig } from "@/kernel/core/lib/multipart";

import {
  progressApiRoutes,
  type ProductionStage,
  type StageAction,
} from "@plugins/production/progress/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  PhotoUploadInput,
  UnitListParams,
  UnitPhoto,
  UnitProgress,
} from "@plugins/production/progress/types";

export async function getUnits(
  params: UnitListParams = {},
): Promise<PaginatedResponse<UnitProgress>> {
  const { data } = await api.get<PaginatedResponse<UnitProgress>>(
    progressApiRoutes.list,
    { params },
  );
  return data;
}

export async function getUnit(id: number): Promise<UnitProgress> {
  const { data } = await api.get<UnitProgress>(progressApiRoutes.detail(id));
  return data;
}

export async function changeStage(
  id: number,
  stage: ProductionStage,
  action: StageAction,
  reason?: string,
): Promise<UnitProgress> {
  const { data } = await api.post<UnitProgress>(
    progressApiRoutes.stage(id, stage, action),
    action === "undo" ? { reason } : {},
  );
  return data;
}

export async function getUnitPhotos(id: number): Promise<UnitPhoto[]> {
  const { data } = await api.get<UnitPhoto[]>(progressApiRoutes.photos(id));
  return data;
}

export async function uploadUnitPhoto(
  id: number,
  input: PhotoUploadInput,
): Promise<UnitPhoto> {
  const body = new FormData();
  body.append("stage", input.stage);
  if (input.issueId !== undefined) {
    body.append("issueId", String(input.issueId));
  }
  body.append("file", input.file);
  const { data } = await api.post<UnitPhoto>(
    progressApiRoutes.photos(id),
    body,
    multipartRequestConfig(),
  );
  return data;
}

/** The image bytes of a photo; the route needs the caller's token, so an <img src> cannot load it. */
export async function fetchPhotoContent(photoId: number): Promise<Blob> {
  const { data } = await api.get<Blob>(
    progressApiRoutes.photoContent(photoId),
    {
      responseType: "blob",
    },
  );
  return data;
}
