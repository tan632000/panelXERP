"use client";

import { useQuery } from "@tanstack/react-query";

import api from "@/kernel/core/api/api";
import { apiRoutes } from "@/kernel/core/constants/apiRoutes";
import { DEFAULT_REFERENCE_DATA_STALE_MS } from "@/kernel/core/constants/list-ui";
import { queryKeys } from "@/kernel/core/constants/queryKeys";

import type { Country } from "@/kernel/core/types/country";

export function useCountries() {
  return useQuery({
    queryKey: queryKeys.reference.countries,
    queryFn: async () => {
      const { data } = await api.get<Country[]>(apiRoutes.reference.countries);
      return data;
    },
    staleTime: DEFAULT_REFERENCE_DATA_STALE_MS,
  });
}
