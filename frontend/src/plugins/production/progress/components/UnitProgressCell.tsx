"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { PRODUCTION_STAGES } from "@plugins/production/progress/constants";

import type { ProductionStage } from "@plugins/production/progress/constants";

/** `k/6` and the stage the cabinet is at, or that it is finished. */
export function UnitProgressCell({
  doneCount,
  currentStage,
}: Readonly<{ doneCount: number; currentStage: ProductionStage | null }>) {
  const t = useTranslations("production");
  return (
    <span>
      <span className="font-mono font-semibold">
        {doneCount}/{PRODUCTION_STAGES.length}
      </span>{" "}
      <span className="text-text-secondary">
        {currentStage ? t(`stages.${currentStage}`) : t("stageDone")}
      </span>
    </span>
  );
}
