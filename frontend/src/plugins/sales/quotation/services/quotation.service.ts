import api from "@/kernel/core/api/api";

import { quotationApiRoutes } from "@plugins/sales/quotation/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  CreateQuotationDto,
  QuotationDetail,
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
