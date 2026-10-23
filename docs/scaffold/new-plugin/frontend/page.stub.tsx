"use client";

import { PageHeader } from "@/core/components/ui/PageHeader";
import { useTranslations } from "next-intl";

export default function {NamePascal}Page() {
  const t = useTranslations("{name}");

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("title")} />
      <p className="px-6 text-text-secondary">{t("placeholder")}</p>
    </div>
  );
}
