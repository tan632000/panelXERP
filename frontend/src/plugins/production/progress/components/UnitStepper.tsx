"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { StatusBadge } from "@/kernel/core/components/ui/StatusBadge";
import { formatIsoDateTime } from "@/kernel/core/lib/formatters";

import type {
  ProductionStage,
  StageAction,
  StageStatus,
} from "@plugins/production/progress/constants";
import type {
  StageProgress,
  UnitProgress,
} from "@plugins/production/progress/types";

const BADGE_TONE: Record<StageStatus, string> = {
  pending: "draft",
  in_progress: "inProgress",
  done: "completed",
};

interface Props {
  unit: UnitProgress;
  actions: Partial<Record<ProductionStage, StageAction>>;
  busy: boolean;
  onAction: (stage: ProductionStage, action: StageAction) => void;
}

/** The six stages in order, each with its status, who did it and the control it offers. */
export function UnitStepper({
  unit,
  actions,
  busy,
  onAction,
}: Readonly<Props>) {
  const t = useTranslations("production");

  const whoAndWhen = (stage: StageProgress): string => {
    if (stage.doneAt) {
      return t("stageDoneBy", {
        name: stage.doneByName ?? t("emptyValue"),
        time: formatIsoDateTime(stage.doneAt),
      });
    }
    if (stage.startedAt) {
      return t("stageStartedBy", {
        name: stage.startedByName ?? t("emptyValue"),
        time: formatIsoDateTime(stage.startedAt),
      });
    }
    return t("stageNotStarted");
  };

  return (
    <ol className="flex flex-col gap-3">
      {unit.stages.map((stage) => {
        const action = actions[stage.stage];
        return (
          <li
            key={stage.stage}
            aria-label={t(`stages.${stage.stage}`)}
            className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border-secondary p-3"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-secondary font-mono text-sm font-semibold">
              {stage.seq}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-text-primary">
                {t(`stages.${stage.stage}`)}
              </p>
              <p className="text-sm text-text-secondary">{whoAndWhen(stage)}</p>
            </div>
            <StatusBadge
              status={BADGE_TONE[stage.status]}
              label={t(`stageStatuses.${stage.status}`)}
            />
            {action ? (
              <button
                type="button"
                disabled={busy}
                className="h-9 rounded-[7px] border border-border-secondary px-3 text-sm font-semibold hover:bg-surface-secondary disabled:opacity-50"
                onClick={() => onAction(stage.stage, action)}
              >
                {t(`stageActions.${action}`, {
                  stage: t(`stages.${stage.stage}`),
                })}
              </button>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
