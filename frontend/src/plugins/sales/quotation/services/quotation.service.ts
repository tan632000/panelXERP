import api from "@/kernel/core/api/api";

import {
  quotationApiRoutes,
  type QuotationAction,
  type QuotationExportFormat,
} from "@plugins/sales/quotation/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  CreateQuotationDto,
  CreateQuotationFeedbackDto,
  QuotationDetail,
  QuotationFeedback,
  QuotationListItem,
  QuotationListParams,
  UpdateQuotationPricingDto,
} from "@plugins/sales/quotation/types";

export async function getQuotations(
  params: QuotationListParams = {},
): Promise<PaginatedResponse<QuotationListItem>> {
  const { data } = await api.get<PaginatedResponse<QuotationListItem>>(
    quotationApiRoutes.list,
    { params },
  );
  return data;
}

export async function getQuotation(
  id: number,
  ver?: number,
): Promise<QuotationDetail> {
  const { data } = await api.get<QuotationDetail>(
    quotationApiRoutes.detail(id),
    { params: ver ? { ver } : undefined },
  );
  return data;
}

export async function createQuotation(
  payload: CreateQuotationDto,
): Promise<QuotationDetail> {
  const { data } = await api.post<QuotationDetail>(
    quotationApiRoutes.list,
    payload,
  );
  return data;
}

/** Answers with the whole quotation as the server now computes it. */
export async function updateQuotationPricing(
  id: number,
  payload: UpdateQuotationPricingDto,
): Promise<QuotationDetail> {
  const { data } = await api.patch<QuotationDetail>(
    quotationApiRoutes.detail(id),
    payload,
  );
  return data;
}

/**
 * Runs one decision of the quotation workflow; `reason` goes with a reject or a cancel. Answers
 * with the whole quotation as the server now holds it.
 */
export async function runQuotationAction(
  id: number,
  action: QuotationAction,
  reason?: string,
): Promise<QuotationDetail> {
  const { data } = await api.post<QuotationDetail>(
    quotationApiRoutes.action(id, action),
    reason === undefined ? undefined : { reason },
  );
  return data;
}

export async function getQuotationFeedback(
  id: number,
): Promise<QuotationFeedback[]> {
  const { data } = await api.get<QuotationFeedback[]>(
    quotationApiRoutes.feedback(id),
  );
  return data;
}

export async function addQuotationFeedback(
  id: number,
  payload: CreateQuotationFeedbackDto,
): Promise<QuotationFeedback> {
  const { data } = await api.post<QuotationFeedback>(
    quotationApiRoutes.feedback(id),
    payload,
  );
  return data;
}

/** The customer-facing file of an approved quotation, as the browser will save it. */
export async function fetchQuotationExport(
  id: number,
  format: QuotationExportFormat,
): Promise<Blob> {
  const { data } = await api.get<Blob>(
    quotationApiRoutes.exportFile(id, format),
    { responseType: "blob" },
  );
  return data;
}
