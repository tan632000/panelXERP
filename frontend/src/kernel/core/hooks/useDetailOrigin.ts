"use client";

import { useSearchParams } from "next/navigation";

import {
  DETAIL_ORIGIN_PARAM,
  decodeDetailOrigin,
  type DetailOrigin,
} from "@/kernel/core/lib/detail-origin";

/**
 * The record this detail screen was opened from, or null when it was reached from its own
 * list. A breadcrumb reads it to lead back to where the reader actually came from.
 */
export function useDetailOrigin(): DetailOrigin | null {
  const searchParams = useSearchParams();
  return decodeDetailOrigin(searchParams.get(DETAIL_ORIGIN_PARAM));
}
