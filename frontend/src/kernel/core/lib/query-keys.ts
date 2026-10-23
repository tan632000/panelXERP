export function createCrudQueryKeys<const TScope extends string>(
  scope: TScope,
) {
  const all = [scope] as const;
  return {
    all,
    list: (filters?: Record<string, unknown>) =>
      [...all, "list", filters] as const,
    detail: (id: number | string) => [...all, id] as const,
    nextCode: () => [...all, "next-code"] as const,
  };
}
