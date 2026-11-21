"use client";

import { useTranslations } from "next-intl";
import React from "react";

import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { formatIsoDate } from "@/kernel/core/lib/formatters";

import { QcPhotoThumb } from "./QcPhotoThumb";
import { QcRoundResultBadge } from "./QcStatusBadge";

import type { QcRound } from "@plugins/delivery/qc-inspection/types";

/** The rounds of a cabinet, newest first, each with its items, notes and photo thumbnails. */
export function QcRoundHistory({ rounds }: Readonly<{ rounds: QcRound[] }>) {
  const t = useTranslations("delivery");
  const newestFirst = [...rounds].sort((a, b) => b.roundNo - a.roundNo);

  return (
    <DetailSection title={t("qc.unit.rounds")}>
      {newestFirst.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("qc.unit.noRounds")}</p>
      ) : (
        <div className="flex flex-col gap-5">
          {newestFirst.map((round) => (
            <section
              key={round.id}
              aria-label={t("qc.unit.roundTitle", { no: round.roundNo })}
              className="flex flex-col gap-2"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-text-primary">
                  {t("qc.unit.roundTitle", { no: round.roundNo })}
                </span>
                <QcRoundResultBadge result={round.result} />
                <span className="text-text-secondary">
                  {formatIsoDate(round.inspectedAt)}
                  {round.inspectorName ? ` · ${round.inspectorName}` : ""}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {round.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-1 rounded-[10px] border border-border-secondary p-2 text-sm"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <span>{item.name}</span>
                      <span
                        className={
                          item.result === "fail"
                            ? "font-semibold text-danger-text"
                            : "text-text-secondary"
                        }
                      >
                        {t(`qc.form.results.${item.result}`)}
                      </span>
                    </div>
                    {item.note ? (
                      <p className="text-text-secondary">{item.note}</p>
                    ) : null}
                    {item.photos.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {item.photos.map((photo) => (
                          <QcPhotoThumb key={photo.id} photo={photo} />
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </DetailSection>
  );
}
