import api from "@/kernel/core/api/api";
import { multipartRequestConfig } from "@/kernel/core/lib/multipart";

import { qcApiRoutes } from "@plugins/delivery/qc-inspection/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  QcDefect,
  QcDefectListParams,
  QcPhoto,
  QcRoundInput,
  QcUnitDetail,
  QcUnitListParams,
  QcUnitSummary,
} from "@plugins/delivery/qc-inspection/types";

export async function getQcUnits(
  params: QcUnitListParams = {},
): Promise<PaginatedResponse<QcUnitSummary>> {
  const { data } = await api.get<PaginatedResponse<QcUnitSummary>>(
    qcApiRoutes.units,
    { params },
  );
  return data;
}

export async function getQcUnit(unitId: number): Promise<QcUnitDetail> {
  const { data } = await api.get<QcUnitDetail>(qcApiRoutes.unit(unitId));
  return data;
}

export async function createQcRound(
  unitId: number,
  input: QcRoundInput,
): Promise<QcUnitDetail> {
  const { data } = await api.post<QcUnitDetail>(
    qcApiRoutes.rounds(unitId),
    input,
  );
  return data;
}

export async function getQcDefects(
  params: QcDefectListParams = {},
): Promise<PaginatedResponse<QcDefect>> {
  const { data } = await api.get<PaginatedResponse<QcDefect>>(
    qcApiRoutes.defects,
    { params },
  );
  return data;
}

export async function fixQcDefect(id: number, note: string): Promise<QcDefect> {
  const { data } = await api.post<QcDefect>(qcApiRoutes.fix(id), { note });
  return data;
}

export async function verifyQcDefect(id: number): Promise<QcDefect> {
  const { data } = await api.post<QcDefect>(qcApiRoutes.verify(id), {});
  return data;
}

export async function uploadQcPhoto(
  roundItemId: number,
  file: File,
): Promise<QcPhoto> {
  const body = new FormData();
  body.append("file", file);
  const { data } = await api.post<QcPhoto>(
    qcApiRoutes.itemPhotos(roundItemId),
    body,
    multipartRequestConfig(),
  );
  return data;
}

/** The image bytes of a photo; the route needs the caller's token, so an <img src> cannot load it. */
export async function fetchQcPhotoContent(photoId: number): Promise<Blob> {
  const { data } = await api.get<Blob>(qcApiRoutes.photoContent(photoId), {
    responseType: "blob",
  });
  return data;
}
