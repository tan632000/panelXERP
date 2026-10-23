"use client";

import { useSearchParams } from "next/navigation";

import { DetailPanelActionButton } from "@/kernel/core/components/ui/DetailPanelActionButton";
import { useRouter } from "@/kernel/i18n/navigation";

interface ReferenceBackButtonProps {
  label: string;
}

/**
 * The "back" button a detail page shows when it was opened from another record's detail — a
 * purchase order's delivery section, for one — which passes its own path as `?refBack=`.
 * Renders nothing otherwise. Only an in-app path is honoured, so the parameter can never send
 * the reader off-site.
 */
export function ReferenceBackButton({
  label,
}: Readonly<ReferenceBackButtonProps>) {
  const router = useRouter();
  const refBack = useSearchParams().get("refBack");
  if (!refBack?.startsWith("/") || refBack.startsWith("//")) return null;

  return (
    <DetailPanelActionButton
      icon="arrow-left"
      iconOnly
      aria-label={label}
      title={label}
      onClick={() => router.push(refBack)}
    />
  );
}
