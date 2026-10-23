"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { DEFAULT_QUERY_CLIENT_STALE_MS } from "@/kernel/core/constants/list-ui";
import {
  queryRetryDelay,
  shouldRetryQuery,
} from "@/kernel/core/lib/query-retry";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: DEFAULT_QUERY_CLIENT_STALE_MS,
            retry: shouldRetryQuery,
            retryDelay: queryRetryDelay,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
