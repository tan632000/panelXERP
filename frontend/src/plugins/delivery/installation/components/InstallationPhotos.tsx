"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { FileInput } from "@/kernel/core/components/ui/FileInput";

import { useUploadInstallationPhoto } from "@plugins/delivery/installation/hooks/api/useInstallation";
import {
  PHOTO_ACCEPT,
  PHOTO_MAX_COUNT,
} from "@plugins/production/progress/constants";
import { photoFileProblem } from "@plugins/production/progress/utils/photo-file";

import { InstallationPhotoThumb } from "./InstallationPhotoThumb";

import type { InstallationPhoto } from "@plugins/delivery/installation/types";

interface Props {
  installationId: number;
  photos: InstallationPhoto[];
  canUpload: boolean;
}

/** The photos of an installation and, for whoever manages it, the picker that adds one. */
export function InstallationPhotos({
  installationId,
  photos,
  canUpload,
}: Readonly<Props>) {
  const t = useTranslations("delivery.installation.photos");
  const upload = useUploadInstallationPhoto(installationId);
  const [problem, setProblem] = useState<string | null>(null);
  const full = photos.length >= PHOTO_MAX_COUNT;

  const handlePick = (file: File) => {
    const rejected = photoFileProblem(file);
    if (rejected) {
      setProblem(t(`problems.${rejected}`));
      return;
    }
    setProblem(null);
    upload.mutate(file);
  };

  return (
    <div className="flex flex-col gap-3">
      {canUpload ? (
        <FileInput
          chooseLabel={t("choose")}
          emptyLabel={t("hint")}
          accept={PHOTO_ACCEPT}
          disabled={upload.isPending || full}
          onPick={handlePick}
        />
      ) : null}
      {problem ? (
        <p role="alert" className="text-xs text-danger-text">
          {problem}
        </p>
      ) : null}
      {full && canUpload ? (
        <p className="text-xs text-text-secondary">
          {t("full", { count: PHOTO_MAX_COUNT })}
        </p>
      ) : null}
      {photos.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("empty")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {photos.map((photo) => (
            <InstallationPhotoThumb key={photo.id} photo={photo} />
          ))}
        </div>
      )}
    </div>
  );
}
