"use client";

import { useParams } from "next/navigation";

import { parsePositiveIntId } from "@/kernel/core/lib/entity-id";

export function useEntityIdParam(paramName = "id"): number | null {
  const params = useParams();
  return parsePositiveIntId(params[paramName]);
}
