import api from "@/kernel/core/api/api";

import { templateApiRoutes } from "@plugins/sales/template/constants";

import type { PaginatedResponse } from "@/kernel/core/types/common";
import type {
  CreateTemplateDto,
  QuotationTemplate,
  QuotationTemplateDetail,
  TemplateListParams,
  UpdateTemplateDto,
} from "@plugins/sales/template/types";

export async function getTemplates(
  params: TemplateListParams = {},
): Promise<PaginatedResponse<QuotationTemplate>> {
  const { data } = await api.get<PaginatedResponse<QuotationTemplate>>(
    templateApiRoutes.list,
    { params },
  );
  return data;
}

export async function getTemplate(
  id: number,
): Promise<QuotationTemplateDetail> {
  const { data } = await api.get<QuotationTemplateDetail>(
    templateApiRoutes.detail(id),
  );
  return data;
}

export async function createTemplate(
  payload: CreateTemplateDto,
): Promise<QuotationTemplateDetail> {
  const { data } = await api.post<QuotationTemplateDetail>(
    templateApiRoutes.list,
    payload,
  );
  return data;
}

export async function updateTemplate(
  id: number,
  payload: UpdateTemplateDto,
): Promise<QuotationTemplateDetail> {
  const { data } = await api.patch<QuotationTemplateDetail>(
    templateApiRoutes.detail(id),
    payload,
  );
  return data;
}

export async function setTemplateActive(
  id: number,
  isActive: boolean,
): Promise<QuotationTemplateDetail> {
  const { data } = await api.post<QuotationTemplateDetail>(
    isActive
      ? templateApiRoutes.activate(id)
      : templateApiRoutes.deactivate(id),
  );
  return data;
}

export async function deleteTemplate(id: number): Promise<void> {
  await api.delete(templateApiRoutes.detail(id));
}
