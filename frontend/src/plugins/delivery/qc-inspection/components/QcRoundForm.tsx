"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { Button } from "@/kernel/core/components/ui/Button";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { FileInput } from "@/kernel/core/components/ui/FileInput";
import { FormTextArea } from "@/kernel/core/components/ui/FormTextArea";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";

import { useChecklistItems } from "@plugins/delivery/qc-checklist/hooks/api/useQcChecklist";
import {
  QC_ITEM_RESULTS,
  QC_NOTE_MAX,
  type QcItemResult,
} from "@plugins/delivery/qc-inspection/constants";
import { useRecordQcRound } from "@plugins/delivery/qc-inspection/hooks/api/useQcInspection";
import {
  PHOTO_ACCEPT,
  PHOTO_MAX_COUNT,
} from "@plugins/production/progress/constants";
import { photoFileProblem } from "@plugins/production/progress/utils/photo-file";

interface Entry {
  result?: QcItemResult;
  note: string;
}

/**
 * The form of a new QC round: one result per item of the active template, a note for every
 * failed item, and photos to attach once the round is recorded. Entries are kept by item id, so
 * when the template changes under the form (409) the results of the items that stayed are kept.
 */
export function QcRoundForm({ unitId }: Readonly<{ unitId: number }>) {
  const t = useTranslations("delivery");
  const template = useChecklistItems(false);
  const record = useRecordQcRound(unitId);
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  const [photos, setPhotos] = useState<Record<number, File[]>>({});
  const [problem, setProblem] = useState<string | null>(null);

  if (template.isLoading) return <LoadingState variant="list" />;
  const items = template.data ?? [];
  if (items.length === 0) {
    return (
      <DetailSection title={t("qc.form.title")}>
        <p className="text-sm text-text-secondary">{t("qc.form.noTemplate")}</p>
      </DetailSection>
    );
  }

  const entryOf = (id: number): Entry => entries[id] ?? { note: "" };
  const change = (id: number, patch: Partial<Entry>) =>
    setEntries((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { note: "" }), ...patch },
    }));
  const complete = items.every((item) => {
    const { result, note } = entryOf(item.id);
    return result !== undefined && (result !== "fail" || note.trim() !== "");
  });
  const photoCount = (id: number) => (photos[id] ?? []).length;

  const pick = (id: number, file: File) => {
    const rejected = photoFileProblem(file);
    if (rejected) {
      setProblem(t(`qc.form.photoProblems.${rejected}`));
      return;
    }
    setProblem(null);
    setPhotos((current) => ({
      ...current,
      [id]: [...(current[id] ?? []), file],
    }));
  };

  const submit = () => {
    record.mutate(
      {
        results: items.map((item) => {
          const { result, note } = entryOf(item.id);
          const trimmed = note.trim();
          return {
            checklistItemId: item.id,
            result: result as QcItemResult,
            ...(trimmed ? { note: trimmed } : {}),
          };
        }),
        photos: Object.fromEntries(
          items.map((item) => [item.id, photos[item.id] ?? []]),
        ),
      },
      {
        onSuccess: () => {
          setEntries({});
          setPhotos({});
        },
      },
    );
  };

  return (
    <DetailSection title={t("qc.form.title")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (complete) submit();
        }}
      >
        {items.map((item) => {
          const { result, note } = entryOf(item.id);
          return (
            <fieldset
              key={item.id}
              className="flex flex-col gap-2 rounded-[10px] border border-border-secondary p-3"
            >
              <legend className="px-1 text-sm font-semibold text-text-primary">
                {item.name}
              </legend>
              <div className="flex flex-wrap gap-4">
                {QC_ITEM_RESULTS.map((value) => (
                  <label
                    key={value}
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <input
                      type="radio"
                      name={`qc-item-${item.id}`}
                      checked={result === value}
                      onChange={() => change(item.id, { result: value })}
                    />
                    {t(`qc.form.results.${value}`)}
                  </label>
                ))}
              </div>
              <FormTextArea
                label={t("qc.form.note")}
                labelHidden
                placeholder={t(
                  result === "fail" ? "qc.form.noteRequired" : "qc.form.note",
                )}
                maxLength={QC_NOTE_MAX}
                value={note}
                onChange={(event) =>
                  change(item.id, { note: event.target.value })
                }
              />
              <FileInput
                chooseLabel={t("qc.form.addPhoto")}
                emptyLabel={
                  photoCount(item.id) > 0
                    ? t("qc.form.photosPicked", { count: photoCount(item.id) })
                    : t("qc.form.photoHint")
                }
                accept={PHOTO_ACCEPT}
                disabled={photoCount(item.id) >= PHOTO_MAX_COUNT}
                onPick={(file) => pick(item.id, file)}
              />
            </fieldset>
          );
        })}
        {problem ? (
          <p role="alert" className="text-xs text-danger-text">
            {problem}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={!complete || record.isPending}>
            {t("qc.form.submit")}
          </Button>
        </div>
      </form>
    </DetailSection>
  );
}
