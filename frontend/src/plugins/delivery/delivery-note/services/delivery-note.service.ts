import api from "@/kernel/core/api/api";
import { multipartRequestConfig } from "@/kernel/core/lib/multipart";

import { deliveryNoteApiRoutes } from "@plugins/delivery/delivery-note/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  DeliverableOrder,
  DeliveryNoteDetail,
  DeliveryNoteInput,
  DeliveryNoteListParams,
  DeliveryNoteSummary,
  DeliveryOrderDetail,
  ReceiveInput,
} from "@plugins/delivery/delivery-note/types";

export async function getDeliverableOrders(): Promise<DeliverableOrder[]> {
  const { data } = await api.get<DeliverableOrder[]>(
    deliveryNoteApiRoutes.deliverable,
  );
  return data;
}

export async function getDeliveryOrder(
  orderId: number,
): Promise<DeliveryOrderDetail> {
  const { data } = await api.get<DeliveryOrderDetail>(
    deliveryNoteApiRoutes.order(orderId),
  );
  return data;
}

export async function getDeliveryNotes(
  params: DeliveryNoteListParams = {},
): Promise<PaginatedResponse<DeliveryNoteSummary>> {
  const { data } = await api.get<PaginatedResponse<DeliveryNoteSummary>>(
    deliveryNoteApiRoutes.notes,
    { params },
  );
  return data;
}

export async function getDeliveryNote(id: number): Promise<DeliveryNoteDetail> {
  const { data } = await api.get<DeliveryNoteDetail>(
    deliveryNoteApiRoutes.note(id),
  );
  return data;
}

export async function createDeliveryNote(
  input: DeliveryNoteInput,
): Promise<DeliveryNoteDetail> {
  const { data } = await api.post<DeliveryNoteDetail>(
    deliveryNoteApiRoutes.notes,
    input,
  );
  return data;
}

export async function shipDeliveryNote(id: number): Promise<DeliveryNoteDetail> {
  const { data } = await api.post<DeliveryNoteDetail>(
    deliveryNoteApiRoutes.ship(id),
    {},
  );
  return data;
}

export async function cancelDeliveryNote(
  id: number,
  reason: string,
): Promise<DeliveryNoteDetail> {
  const { data } = await api.post<DeliveryNoteDetail>(
    deliveryNoteApiRoutes.cancel(id),
    { reason },
  );
  return data;
}

export async function receiveDeliveryNote(
  id: number,
  input: ReceiveInput,
): Promise<DeliveryNoteDetail> {
  const body = new FormData();
  body.append("receiverName", input.receiverName);
  body.append("receivedDate", input.receivedDate);
  for (const file of input.files) body.append("files", file);
  const { data } = await api.post<DeliveryNoteDetail>(
    deliveryNoteApiRoutes.receive(id),
    body,
    multipartRequestConfig(),
  );
  return data;
}

/** The bytes of a handover file; the route needs the caller's token, so a plain link cannot load it. */
export async function fetchDeliveryNoteFile(
  id: number,
  fileId: number,
): Promise<Blob> {
  const { data } = await api.get<Blob>(
    deliveryNoteApiRoutes.fileContent(id, fileId),
    { responseType: "blob" },
  );
  return data;
}
