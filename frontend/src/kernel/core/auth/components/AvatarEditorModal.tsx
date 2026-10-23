"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import api from "@/kernel/core/api/api";
import { useAuth } from "@/kernel/core/auth/AuthContext";
import { Button } from "@/kernel/core/components/ui/Button";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { IconToolButton } from "@/kernel/core/components/ui/IconToolButton";
import { ImageCropFrame } from "@/kernel/core/components/ui/ImageCropFrame";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { RangeSlider } from "@/kernel/core/components/ui/RangeSlider";
import { apiRoutes } from "@/kernel/core/constants/apiRoutes";
import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import {
  NO_ADJUSTMENTS,
  canvasToBlob,
  centeredFrame,
  mirrorCanvas,
  renderAdjustedCrop,
  rotateCanvas,
  straightenCanvas,
  zoomFrame,
} from "@/kernel/core/lib/image-canvas";
import { multipartRequestConfig } from "@/kernel/core/lib/multipart";

import type { MeResponse } from "@/kernel/core/auth/types";
import type {
  ImageAdjustments,
  NormalizedRect,
} from "@/kernel/core/lib/image-canvas";

/** Avatars are square everywhere they are shown. */
const AVATAR_ASPECT = 1;

/**
 * Stored size: sharp at the largest place an avatar is shown (80px, on a 3× screen) and a few
 * dozen KB as a JPEG, however large the photo it was cut from.
 */
const AVATAR_OUTPUT_SIZE = 512;
const AVATAR_JPEG_QUALITY = 0.9;

const PREVIEW_SIZE = 224;

/** Closest the frame zooms in: a quarter of the photo's shorter side. */
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

/** A tilted photo is rarely off by more than this; beyond it the reader turns by 90°. */
const MAX_TILT = 20;

const ADJUSTMENT_KEYS: Array<keyof ImageAdjustments> = [
  "brightness",
  "contrast",
  "saturation",
];

interface Orientation {
  quarterTurns: number;
  tilt: number;
  mirrored: boolean;
}

const ORIGINAL: Orientation = { quarterTurns: 0, tilt: 0, mirrored: false };

/**
 * Quarter turns change the photo's shape; the tilt then straightens it inside that shape,
 * enlarged just enough that no blank corner shows in the avatar.
 */
function orient(photo: HTMLCanvasElement, o: Orientation): HTMLCanvasElement {
  const flipped = o.mirrored ? mirrorCanvas(photo) : photo;
  const turned =
    o.quarterTurns === 0 ? flipped : rotateCanvas(flipped, o.quarterTurns * 90);
  return straightenCanvas(turned, o.tilt);
}

function squareOf(canvas: HTMLCanvasElement): NormalizedRect {
  return centeredFrame(AVATAR_ASPECT, canvas.width, canvas.height);
}

/**
 * Crops, straightens and touches up a picked photo before it becomes the avatar. The frame is
 * held square and starts on the largest centred square, so saving straight away still gives a
 * sensible picture; "restore original" brings every setting back to that start.
 */
export function AvatarEditorModal({
  photo,
  onClose,
}: {
  photo: HTMLCanvasElement;
  onClose: () => void;
}) {
  const t = useTranslations("auth");
  const { applySessionUpdate } = useAuth();
  const { showSuccess, showError } = useNotification();
  const previewRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const [orientation, setOrientation] = useState<Orientation>(ORIGINAL);
  const [adjustments, setAdjustments] =
    useState<ImageAdjustments>(NO_ADJUSTMENTS);
  const [saving, setSaving] = useState(false);

  const oriented = useMemo(
    () => orient(photo, orientation),
    [photo, orientation],
  );
  const largest = squareOf(oriented);
  const [crop, setCrop] = useState<NormalizedRect>(() => squareOf(photo));
  const zoom = largest.width / crop.width;

  useEffect(() => {
    const rendered = renderAdjustedCrop(
      oriented,
      crop,
      PREVIEW_SIZE,
      adjustments,
    );
    for (const canvas of [previewRef.current, miniRef.current]) {
      canvas?.getContext("2d")?.drawImage(rendered, 0, 0);
    }
  }, [oriented, crop, adjustments]);

  const colorsChanged = ADJUSTMENT_KEYS.some((key) => adjustments[key] !== 0);
  const zoomed = Math.abs(zoom - 1) > 0.001;
  const changed =
    colorsChanged ||
    zoomed ||
    orientation.quarterTurns !== 0 ||
    orientation.tilt !== 0 ||
    orientation.mirrored ||
    Math.abs(crop.x - largest.x) > 0.001 ||
    Math.abs(crop.y - largest.y) > 0.001;

  // A quarter turn changes the photo's shape, so the square is re-centred on the turned photo.
  const turn = (step: number) => {
    const next = {
      ...orientation,
      quarterTurns: (orientation.quarterTurns + step + 4) % 4,
    };
    setOrientation(next);
    setCrop(squareOf(orient(photo, next)));
  };

  // A mirror keeps the photo's shape, so the frame is mirrored with it and stays on the face.
  const mirror = () => {
    setOrientation((prev) => ({ ...prev, mirrored: !prev.mirrored }));
    setCrop((prev) => ({ ...prev, x: 1 - prev.x - prev.width }));
  };

  const setZoom = (next: number) =>
    setCrop(zoomFrame(crop, largest, Math.min(Math.max(next, 1), MAX_ZOOM)));

  const restoreOriginal = () => {
    setOrientation(ORIGINAL);
    setAdjustments(NO_ADJUSTMENTS);
    setCrop(squareOf(photo));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const blob = await canvasToBlob(
        renderAdjustedCrop(oriented, crop, AVATAR_OUTPUT_SIZE, adjustments),
        "image/jpeg",
        AVATAR_JPEG_QUALITY,
      );
      const body = new FormData();
      body.append("file", blob, "avatar.jpg");
      const { data } = await api.post<MeResponse>(
        apiRoutes.auth.avatar,
        body,
        multipartRequestConfig(),
      );
      applySessionUpdate(data);
      showSuccess(t("avatarUpdated"));
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
      extraWide
      onClose={onClose}
      title={t("avatarEditor.title")}
      onSubmit={() => void handleSave()}
      submitLabel={t("avatarEditor.save")}
      submitDisabled={saving}
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_17.5rem]">
        {/* Crop & rotate */}
        <div className="min-w-0 space-y-3">
          <div className="flex h-[22rem] items-center justify-center rounded-xl bg-slate-900 p-4">
            <ImageCropFrame
              image={oriented}
              crop={crop}
              aspect={AVATAR_ASPECT}
              maxHeight="20rem"
              onChange={(next) => {
                if (next) setCrop(next);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border-secondary px-2 py-1.5">
            <IconToolButton
              icon="rotate-left"
              label={t("imageEditor.rotateLeft")}
              onClick={() => turn(-1)}
            />
            <IconToolButton
              icon="rotate-right"
              label={t("imageEditor.rotateRight")}
              onClick={() => turn(1)}
            />
            <IconToolButton
              icon="flip"
              label={t("avatarEditor.mirror")}
              pressed={orientation.mirrored}
              onClick={mirror}
            />
            <span className="mx-1 h-6 w-px bg-border-secondary" />
            <IconToolButton
              icon="zoom-out"
              label={t("avatarEditor.zoomOut")}
              disabled={zoom <= 1}
              onClick={() => setZoom(zoom - ZOOM_STEP)}
            />
            <input
              type="range"
              aria-label={t("avatarEditor.zoom")}
              min={1}
              max={MAX_ZOOM}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="min-w-24 flex-1 cursor-pointer accent-brand"
            />
            <IconToolButton
              icon="zoom-in"
              label={t("avatarEditor.zoomIn")}
              disabled={zoom >= MAX_ZOOM}
              onClick={() => setZoom(zoom + ZOOM_STEP)}
            />
            <span className="w-12 text-right text-xs font-semibold tabular-nums text-text-secondary">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          <RangeSlider
            label={t("imageEditor.tilt")}
            value={orientation.tilt}
            min={-MAX_TILT}
            max={MAX_TILT}
            display={`${orientation.tilt}°`}
            onChange={(tilt) => setOrientation((prev) => ({ ...prev, tilt }))}
          />
          <p className="text-xs text-text-tertiary">
            {t("avatarEditor.cropHint")}
          </p>
        </div>

        {/* Preview, colours, restore */}
        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-border-secondary p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              {t("avatarEditor.preview")}
            </p>
            <div className="mt-3 flex items-end gap-4">
              <canvas
                ref={previewRef}
                width={PREVIEW_SIZE}
                height={PREVIEW_SIZE}
                aria-label={t("avatarEditor.preview")}
                className="size-28 rounded-2xl shadow-md ring-4 ring-surface-secondary"
              />
              <canvas
                ref={miniRef}
                width={PREVIEW_SIZE}
                height={PREVIEW_SIZE}
                aria-hidden
                className="size-10 rounded-full ring-2 ring-surface-secondary"
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-text-tertiary">
              {t("avatarEditor.previewHint")}
            </p>
          </section>

          <section className="space-y-3 rounded-xl border border-border-secondary p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text-primary">
                {t("avatarEditor.colors")}
              </p>
              {colorsChanged && (
                <button
                  type="button"
                  onClick={() => setAdjustments(NO_ADJUSTMENTS)}
                  className="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-brand hover:underline [font-family:inherit]"
                >
                  {t("avatarEditor.resetColors")}
                </button>
              )}
            </div>
            {ADJUSTMENT_KEYS.map((key) => (
              <RangeSlider
                key={key}
                label={t(`avatarEditor.${key}`)}
                value={adjustments[key]}
                min={-100}
                max={100}
                display={
                  adjustments[key] > 0
                    ? `+${adjustments[key]}`
                    : `${adjustments[key]}`
                }
                onChange={(value) =>
                  setAdjustments((prev) => ({ ...prev, [key]: value }))
                }
              />
            ))}
          </section>

          <Button
            variant="secondary"
            disabled={!changed}
            onClick={restoreOriginal}
            className="mt-auto justify-center"
          >
            <Icon name="restore" size={16} />
            {t("imageEditor.restoreOriginal")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
