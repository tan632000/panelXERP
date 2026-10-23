"use client";

import { useEffect } from "react";

import { toast } from "@/kernel/core/lib/toast";

export function useQueryErrorToast(
  isError: boolean,
  message: string,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled || !isError) {
      return;
    }
    toast.showError(message);
  }, [enabled, isError, message]);
}
