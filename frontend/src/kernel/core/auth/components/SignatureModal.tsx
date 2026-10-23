"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import api from "@/kernel/core/api/api";
import { useAuth } from "@/kernel/core/auth/AuthContext";
import { InkColorPicker } from "@/kernel/core/auth/components/InkColorPicker";
import { SignaturePad } from "@/kernel/core/auth/components/SignaturePad";
import { SignaturePhotoEditor } from "@/kernel/core/auth/components/SignaturePhotoEditor";
import {
  SIGNATURE_PEN_COLORS,
  exportSignatureStrokes,
} from "@/kernel/core/auth/signature-image";
import { Button } from "@/kernel/core/components/ui/Button";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { SegmentedTabs } from "@/kernel/core/components/ui/SegmentedTabs";
import { apiRoutes } from "@/kernel/core/constants/apiRoutes";
import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import { loadImageForEditing } from "@/kernel/core/lib/image-canvas";
import { multipartRequestConfig } from "@/kernel/core/lib/multipart";

import type { SignatureStroke } from "@/kernel/core/auth/signature-image";
import type { MeResponse } from "@/kernel/core/auth/types";

type SignatureMode = "upload" | "draw";

/** Formats every browser can decode into a canvas; HEIC is not one of them. */
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** A raw phone photo, before it is scaled down and cropped. */
const PHOTO_MAX_BYTES = 15 * 1024 * 1024;

export function SignatureModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("auth");
  const { applySessionUpdate, can } = useAuth();
  // Only an administrator's signature applies at once; anyone else's waits for approval.
  const needsReview = !can("*:*");
  const { showSuccess, showError } = useNotification();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<SignatureMode>("upload");
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  // Bumped per photo, so a new photo starts the editor from scratch rather than from the last
  // photo's rotation and crop.
  const [photoKey, setPhotoKey] = useState(0);
  const [photoResult, setPhotoResult] = useState<Blob | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [penColor, setPenColor] = useState<string>(SIGNATURE_PEN_COLORS.black);
  const [saving, setSaving] = useState(false);

  const handlePhoto = async (file: File) => {
    if (!PHOTO_TYPES.includes(file.type)) {
      showError(t("signature.photoTypeInvalid"));
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      showError(t("signature.photoTooLarge"));
      return;
    }

    setLoadingPhoto(true);
    try {
      const loaded = await loadImageForEditing(file);
      setPhotoResult(null);
      setPhoto(loaded);
      setPhotoKey((prev) => prev + 1);
    } catch {
      showError(t("imageEditor.photoUnreadable"));
    } finally {
      setLoadingPhoto(false);
    }
  };

  const canSave =
    !saving && (mode === "upload" ? photoResult !== null : strokes.length > 0);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const blob =
        mode === "upload" && photoResult
          ? photoResult
          : await exportSignatureStrokes(strokes, penColor);
      const body = new FormData();
      body.append("file", blob, "signature.png");
      const { data } = await api.post<MeResponse>(
        apiRoutes.auth.signature,
        body,
        multipartRequestConfig(),
      );
      applySessionUpdate(data);
      // Anyone but an administrator submits for review: the signature is not printed yet.
      showSuccess(
        data.user.pendingSignatureUrl
          ? t("signature.submitted")
          : t("signature.updated"),
      );
      onClose();
    } catch {
      showError(t("requestFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      wide
      extraWide={mode === "upload" && photo !== null}
      onClose={onClose}
      title={t("signature.modalTitle")}
      onSubmit={() => void handleSave()}
      submitLabel={t("signature.save")}
      submitDisabled={!canSave}
    >
      {needsReview && (
        <p className="mb-3 flex items-start gap-2 rounded-md bg-warning-bg px-3 py-2 text-xs leading-5 text-warning-text">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />
          {t("signature.reviewNotice")}
        </p>
      )}
      <SegmentedTabs
        shape="rounded"
        aria-label={t("signature.title")}
        activeKey={mode}
        onChange={(key) => setMode(key as SignatureMode)}
        items={[
          { key: "upload", label: t("signature.tabUpload"), icon: "photo" },
          { key: "draw", label: t("signature.tabDraw"), icon: "signature" },
        ]}
      />

      {mode === "upload" ? (
        <div className="space-y-3">
          {/* The editor explains itself once a photo is in; before that, this says what to do. */}
          {!photo && (
            <p className="text-sm leading-6 text-text-secondary">
              {t("signature.uploadHint")}
            </p>
          )}
          {photo ? (
            <SignaturePhotoEditor
              key={photoKey}
              photo={photo}
              onResult={setPhotoResult}
              onPickAnother={() => inputRef.current?.click()}
            />
          ) : (
            <button
              type="button"
              disabled={loadingPhoto}
              onClick={() => inputRef.current?.click()}
              className="flex h-44 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-secondary bg-surface-secondary text-sm font-medium text-text-secondary transition-colors hover:border-brand hover:text-brand disabled:cursor-wait [font-family:inherit]"
            >
              <Icon
                name={loadingPhoto ? "refresh" : "upload"}
                size={24}
                className={loadingPhoto ? "animate-spin" : undefined}
              />
              {loadingPhoto
                ? t("signature.processing")
                : t("signature.pickPhoto")}
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={PHOTO_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Cleared straight away, so picking the same file twice still fires a change.
              e.target.value = "";
              if (file) void handlePhoto(file);
            }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-text-secondary">
            {t("signature.drawHint")}
          </p>
          <SignaturePad
            strokes={strokes}
            onChange={setStrokes}
            color={penColor}
            placeholder={t("signature.drawPlaceholder")}
            ariaLabel={t("signature.tabDraw")}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <InkColorPicker value={penColor} onChange={setPenColor} />
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={strokes.length === 0}
                onClick={() => setStrokes((prev) => prev.slice(0, -1))}
              >
                <Icon name="arrow-back" size={16} />
                {t("signature.undo")}
              </Button>
              <Button
                variant="ghost"
                disabled={strokes.length === 0}
                onClick={() => setStrokes([])}
              >
                <Icon name="eraser" size={16} />
                {t("signature.clear")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
