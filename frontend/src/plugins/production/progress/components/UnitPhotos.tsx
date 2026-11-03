"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { DetailSection } from "@/kernel/core/components/ui/DetailSection";
import { FileInput } from "@/kernel/core/components/ui/FileInput";
import { FormSelect } from "@/kernel/core/components/ui/FormSelect";
import { isFrontendFeatureEnabled } from "@/kernel/platform/features/enabled-feature-keys";

import { useIssueList } from "@plugins/production/production-issue/hooks/api/useProductionIssue";
import { ProductionIssuePermission } from "@plugins/production/production-issue/permissions/production-issue-permission.keys";
import {
  PHOTO_ACCEPT,
  PHOTO_MAX_COUNT,
  PRODUCTION_STAGES,
  type ProductionStage,
} from "@plugins/production/progress/constants";
import {
  useUnitPhotos,
  useUploadPhoto,
} from "@plugins/production/progress/hooks/api/useProgress";
import { photoFileProblem } from "@plugins/production/progress/utils/photo-file";

import { UnitPhotoThumb } from "./UnitPhotoThumb";

interface Props {
  unitId: number;
  /** The stage a new photo starts on, usually the cabinet's current one. */
  currentStage: ProductionStage;
  /** Whether the caller may add photos now: the right, and an order still released. */
  canUpload: boolean;
}

/** The photos of a cabinet by stage, and the picker that adds one to a stage. */
export function UnitPhotos({
  unitId,
  currentStage,
  canUpload,
}: Readonly<Props>) {
  const t = useTranslations("production");
  const { can } = useAuth();
  const photos = useUnitPhotos(unitId);
  const upload = useUploadPhoto(unitId);
  const openIssues = useIssueList(
    { unitId, status: "open", limit: 50 },
    canUpload &&
      can(ProductionIssuePermission.read) &&
      isFrontendFeatureEnabled("production-issue"),
  );
  const [stage, setStage] = useState<ProductionStage>(currentStage);
  const [issueId, setIssueId] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const all = photos.data ?? [];
  const full = all.length >= PHOTO_MAX_COUNT;
  const issues = openIssues.data?.data ?? [];

  const handlePick = (file: File) => {
    const rejected = photoFileProblem(file);
    if (rejected) {
      setProblem(t(`photos.problems.${rejected}`));
      return;
    }
    setProblem(null);
    upload.mutate({
      file,
      stage,
      issueId: issueId === "" ? undefined : Number(issueId),
    });
  };

  return (
    <DetailSection title={t("photos.title")}>
      {canUpload ? (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <FormSelect
            label={t("photos.stage")}
            searchable={false}
            value={stage}
            options={PRODUCTION_STAGES.map((value) => ({
              value,
              label: t(`stages.${value}`),
            }))}
            onChange={(event) =>
              setStage(event.target.value as ProductionStage)
            }
          />
          {issues.length > 0 ? (
            <FormSelect
              label={t("photos.issue")}
              placeholder={t("photos.noIssue")}
              allowClear
              searchable={false}
              value={issueId}
              options={issues.map((issue) => ({
                value: String(issue.id),
                label: `${t(`stages.${issue.stage}`)}: ${issue.description.slice(0, 40)}`,
              }))}
              onChange={(event) => setIssueId(event.target.value)}
            />
          ) : null}
          <FileInput
            chooseLabel={t("photos.choose")}
            emptyLabel={t("photos.hint")}
            accept={PHOTO_ACCEPT}
            disabled={upload.isPending || full}
            onPick={handlePick}
          />
        </div>
      ) : null}
      {problem ? (
        <p role="alert" className="mb-2 text-xs text-danger-text">
          {problem}
        </p>
      ) : null}
      {full && canUpload ? (
        <p className="mb-2 text-xs text-text-secondary">
          {t("photos.full", { count: PHOTO_MAX_COUNT })}
        </p>
      ) : null}

      {all.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("photos.empty")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {PRODUCTION_STAGES.map((value) => {
            const ofStage = all.filter((photo) => photo.stage === value);
            if (ofStage.length === 0) return null;
            return (
              <section key={value} aria-label={t(`stages.${value}`)}>
                <p className="mb-2 text-sm font-semibold text-text-primary">
                  {t(`stages.${value}`)} ({ofStage.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {ofStage.map((photo) => (
                    <UnitPhotoThumb key={photo.id} photo={photo} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </DetailSection>
  );
}
