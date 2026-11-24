"use client";

import { useQuery } from "@tanstack/react-query";

import { DEFAULT_LIST_STALE_MS } from "@/kernel/core/constants/list-ui";

import { getActiveQuotationTemplates } from "@plugins/crm/project/services/project.service";
import { templateQueryKeys } from "@plugins/sales/template/constants";

/** Active quotation templates; no retry, so a disabled template feature (404) settles fast. */
export function useActiveTemplates(enabled: boolean) {
  return useQuery({
    queryKey: [...templateQueryKeys.all, "active"],
    queryFn: getActiveQuotationTemplates,
    staleTime: DEFAULT_LIST_STALE_MS,
    enabled,
    retry: false,
  });
}
