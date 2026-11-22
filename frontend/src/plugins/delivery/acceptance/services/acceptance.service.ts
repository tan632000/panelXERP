import api from "@/kernel/core/api/api";
import { multipartRequestConfig } from "@/kernel/core/lib/multipart";

import { acceptanceApiRoutes } from "@plugins/delivery/acceptance/constants";

import type {
  AcceptanceInput,
  AcceptanceView,
} from "@plugins/delivery/acceptance/types";

/** The minutes of an order, or null while it has none (the generated client types no body for it). */
export async function getAcceptance(
  orderId: number,
): Promise<AcceptanceView | null> {
  const { data } = await api.get<AcceptanceView | null>(
    acceptanceApiRoutes.order(orderId),
  );
  return data;
}

export async function createAcceptance(
  orderId: number,
  input: AcceptanceInput,
): Promise<AcceptanceView> {
  const body = new FormData();
  body.append("representativeName", input.representativeName);
  body.append("signedDate", input.signedDate);
  for (const file of input.files) body.append("files", file);
  const { data } = await api.post<AcceptanceView>(
    acceptanceApiRoutes.order(orderId),
    body,
    multipartRequestConfig(),
  );
  return data;
}

/** The bytes of a minutes file; the route needs the caller's token, so a plain link cannot load it. */
export async function fetchAcceptanceFile(fileId: number): Promise<Blob> {
  const { data } = await api.get<Blob>(acceptanceApiRoutes.fileContent(fileId), {
    responseType: "blob",
  });
  return data;
}
