import api from "@/kernel/core/api/api";
import { multipartRequestConfig } from "@/kernel/core/lib/multipart";

import { projectApiRoutes } from "@plugins/crm/project/constants";
import {
  REQUEST_PICKER_LIMIT,
  requestApiRoutes,
} from "@plugins/sales/request/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  AssignRequestDto,
  CreateRequestDto,
  EngineerOption,
  RequestActivity,
  RequestAttachment,
  RequestDetail,
  RequestListItem,
  RequestListParams,
  RequestReasonDto,
  UpdateRequestDto,
} from "@plugins/sales/request/types";

export async function getRequests(
  params: RequestListParams = {},
): Promise<PaginatedResponse<RequestListItem>> {
  const { data } = await api.get<PaginatedResponse<RequestListItem>>(
    requestApiRoutes.list,
    { params },
  );
  return data;
}

export async function getRequest(id: number): Promise<RequestDetail> {
  const { data } = await api.get<RequestDetail>(requestApiRoutes.detail(id));
  return data;
}

export async function createRequest(
  payload: CreateRequestDto,
): Promise<RequestDetail> {
  const { data } = await api.post<RequestDetail>(
    requestApiRoutes.list,
    payload,
  );
  return data;
}

export async function updateRequest(
  id: number,
  payload: UpdateRequestDto,
): Promise<RequestDetail> {
  const { data } = await api.patch<RequestDetail>(
    requestApiRoutes.detail(id),
    payload,
  );
  return data;
}

export async function assignRequest(
  id: number,
  payload: AssignRequestDto,
): Promise<RequestDetail> {
  const { data } = await api.post<RequestDetail>(
    requestApiRoutes.assign(id),
    payload,
  );
  return data;
}

export async function cancelRequest(
  id: number,
  payload: RequestReasonDto,
): Promise<RequestDetail> {
  const { data } = await api.post<RequestDetail>(
    requestApiRoutes.cancel(id),
    payload,
  );
  return data;
}

export async function markRequestLost(
  id: number,
  payload: RequestReasonDto,
): Promise<RequestDetail> {
  const { data } = await api.post<RequestDetail>(
    requestApiRoutes.lost(id),
    payload,
  );
  return data;
}

export async function getRequestActivities(
  id: number,
): Promise<RequestActivity[]> {
  const { data } = await api.get<RequestActivity[]>(
    requestApiRoutes.activities(id),
  );
  return data;
}

export async function getEngineerOptions(): Promise<EngineerOption[]> {
  const { data } = await api.get<EngineerOption[]>(
    requestApiRoutes.engineerOptions,
  );
  return data;
}

export async function getRequestAttachments(
  id: number,
): Promise<RequestAttachment[]> {
  const { data } = await api.get<RequestAttachment[]>(
    requestApiRoutes.attachments(id),
  );
  return data;
}

export async function uploadRequestAttachment(
  id: number,
  file: File,
): Promise<RequestAttachment> {
  const body = new FormData();
  body.append("file", file);
  const { data } = await api.post<RequestAttachment>(
    requestApiRoutes.attachments(id),
    body,
    multipartRequestConfig(),
  );
  return data;
}

export async function deleteRequestAttachment(
  id: number,
  attachmentId: number,
): Promise<void> {
  await api.delete(requestApiRoutes.attachment(id, attachmentId));
}

export async function fetchRequestAttachment(
  id: number,
  attachmentId: number,
): Promise<Blob> {
  const { data } = await api.get<Blob>(
    requestApiRoutes.attachment(id, attachmentId),
    { responseType: "blob" },
  );
  return data;
}

/** The projects of one customer, for the project select of the request form. */
export async function getCustomerProjectOptions(
  customerId: number,
): Promise<Array<{ id: number; code: string; name: string }>> {
  const { data } = await api.get<
    PaginatedResponse<{ id: number; code: string; name: string }>
  >(projectApiRoutes.list, {
    params: { customerId, limit: REQUEST_PICKER_LIMIT },
  });
  return data.data;
}
