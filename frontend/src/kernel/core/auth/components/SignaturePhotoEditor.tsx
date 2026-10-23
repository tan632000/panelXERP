"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import {
  InkColorPicker,
  ORIGINAL_INK,
} from "@/kernel/core/auth/components/InkColorPicker";
import { extractSignature } from "@/kernel/core/auth/signature-image";
import { FormCheckbox } from "@/kernel/core/components/ui/FormCheckbox";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { IconToolButton } from "@/kernel/core/components/ui/IconToolButton";
import { ImageCropFrame } from "@/kernel/core/components/ui/ImageCropFrame";
import { RangeSlider } from "@/kernel/core/components/ui/RangeSlider";
import { rotateCanvas, straightenCanvas } from "@/kernel/core/lib/image-canvas";

import type { NormalizedRect } from "@/kernel/core/lib/image-canvas";

/** Waits for the reader to stop dragging a slider before reprocessing the photo. */
const PROCESS_DELAY_MS = 150;

/** A tilted photo is rarely off by more than this; beyond it the reader turns by 90°. */
const MAX_TILT = 20;

const DEFAULT_SENSITIVITY = 50;

/** Checkerboard behind the result, so the reader can see the paper really is gone. */
const TRANSPARENCY_BACKDROP = {
  backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%)",
  backgroundSize: "16px 16px",
};

/**
 * Quarter turns change the photo's shape; the tilt then straightens it inside that shape, so a
 * crop survives the tilt and only a quarter turn has to reset it.
 */
function orient(
  photo: HTMLCanvasElement,
  quarterTurns: number,
  tilt: number,
): HTMLCanvasElement {
  const turned =
    quarterTurns === 0 ? photo : rotateCanvas(photo, quarterTurns * 90);
  return straightenCanvas(turned, tilt);
}

/**
 * Straightens and frames a signature photo, then shows what the stored signature will look
 * like. A phone photo is often sideways or tilted and shows more than the signature — ruled
 * lines, the page edge — so the reader turns it, crops to the signature, and tunes how faint
 * a stroke still counts as ink.
 */
export function SignaturePhotoEditor({
  photo,
  onResult,
  onPickAnother,
}: {
  photo: HTMLCanvasElement;
  onResult: (blob: Blob | null) => void;
  onPickAnother: () => void;
}) {
  const t = useTranslations("auth");
  const [quarterTurns, setQuarterTurns] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [sensitivity, setSensitivity] = useState(DEFAULT_SENSITIVITY);
  const [removeLines, setRemoveLines] = useState(true);
  const [tone, setTone] = useState<string>(ORIGINAL_INK);
  const [crop, setCrop] = useState<NormalizedRect | null>(null);
  // The result carries the settings it was made from, so "still processing" is simply the
  // settings having moved on since — no state to flip on at the start of every run.
  const [result, setResult] = useState<{
    settings: unknown;
    url: string | null;
  } | null>(null);

  const oriented = useMemo(
    () => orient(photo, quarterTurns, tilt),
    [photo, quarterTurns, tilt],
  );

  const settings = useMemo(
    () => ({ oriented, sensitivity, removeLines, crop, tone }),
    [oriented, sensitivity, removeLines, crop, tone],
  );
  const preview = result?.url ?? null;
  const processing = result?.settings !== settings;

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    const timer = window.setTimeout(() => {
      extractSignature(oriented, {
        sensitivity: sensitivity / 100,
        removeLines,
        crop,
        tone,
      })
        .catch(() => null)
        .then((blob) => {
          if (cancelled) return;
          url = blob ? URL.createObjectURL(blob) : null;
          setResult({ settings, url });
          onResult(blob);
        });
    }, PROCESS_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [settings, oriented, sensitivity, removeLines, crop, tone, onResult]);

  // A crop drawn on the old orientation frames the wrong part of the turned photo.
  const turn = (step: number) => {
    setQuarterTurns((prev) => (prev + step + 4) % 4);
    setCrop(null);
  };

  const changed =
    quarterTurns !== 0 ||
    tilt !== 0 ||
    crop !== null ||
    sensitivity !== DEFAULT_SENSITIVITY ||
    !removeLines ||
    tone !== ORIGINAL_INK;

  const restoreOriginal = () => {
    setQuarterTurns(0);
    setTilt(0);
    setCrop(null);
    setSensitivity(DEFAULT_SENSITIVITY);
    setRemoveLines(true);
    setTone(ORIGINAL_INK);
  };

  const resultImage = preview ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={preview}
      alt={t("signature.alt")}
      className="max-h-full max-w-full object-contain"
    />
  ) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      {/* Editing: the photo, its tools, and how the ink is lifted out */}
      <div className="min-w-0 space-y-3">
        <div className="flex h-[19rem] items-center justify-center rounded-xl bg-slate-900 p-4">
          <ImageCropFrame
            image={oriented}
            crop={crop}
            onChange={setCrop}
            maxHeight="17rem"
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
            icon="crop"
            label={t("imageEditor.clearCrop")}
            disabled={crop === null}
            onClick={() => setCrop(null)}
          />
          <span className="mx-1 h-6 w-px bg-border-secondary" />
          <div className="min-w-40 flex-1 px-1">
            <RangeSlider
              label={t("imageEditor.tilt")}
              value={tilt}
              min={-MAX_TILT}
              max={MAX_TILT}
              display={`${tilt}°`}
              onChange={setTilt}
            />
          </div>
          <span className="mx-1 h-6 w-px bg-border-secondary" />
          <IconToolButton
            icon="photo"
            label={t("imageEditor.pickAnother")}
            onClick={onPickAnother}
          />
          <IconToolButton
            icon="restore"
            label={t("imageEditor.restoreOriginal")}
            disabled={!changed}
            onClick={restoreOriginal}
          />
        </div>
        <p className="text-xs text-text-tertiary">
          {t("imageEditor.cropHint")}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <section className="space-y-2 rounded-xl border border-border-secondary p-4">
            <p className="text-sm font-semibold text-text-primary">
              {t("signature.backgroundSection")}
            </p>
            <RangeSlider
              label={t("signature.sensitivity")}
              value={sensitivity}
              min={0}
              max={100}
              step={5}
              display={`${sensitivity}%`}
              hint={t("signature.sensitivityHint")}
              onChange={setSensitivity}
            />
            <FormCheckbox
              label={t("signature.removeLines")}
              checked={removeLines}
              onChange={setRemoveLines}
            />
          </section>

          <section className="space-y-2.5 rounded-xl border border-border-secondary p-4">
            <p className="text-sm font-semibold text-text-primary">
              {t("signature.inkColor")}
            </p>
            <InkColorPicker value={tone} onChange={setTone} allowOriginal />
          </section>
        </div>
      </div>

      {/* Result: what will be stored, and how it prints */}
      <section className="flex flex-col rounded-xl border border-border-secondary bg-surface-secondary/40 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {t("signature.result")}
          </p>
          {processing && (
            <Icon
              name="refresh"
              size={14}
              className="animate-spin text-text-tertiary"
            />
          )}
        </div>

        <div
          className="mt-3 flex min-h-48 flex-1 items-center justify-center rounded-lg border border-border-tertiary p-4"
          style={TRANSPARENCY_BACKDROP}
        >
          {resultImage ??
            (!processing && (
              <span className="rounded bg-surface-primary px-2 py-1 text-center text-xs text-text-secondary">
                {t("signature.noInkFound")}
              </span>
            ))}
        </div>
        <p className="mt-1.5 text-xs text-text-tertiary">
          {t("signature.transparentHint")}
        </p>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          {t("signature.printPreview")}
        </p>
        {/* A signature block as a printed document lays it out: the stamp over a rule. */}
        <div className="mt-2 rounded-lg border border-border-tertiary bg-white px-6 pb-4 pt-3 shadow-sm">
          <div className="flex h-20 items-end justify-center">
            {resultImage}
          </div>
          <div className="mx-auto mt-1 w-2/3 border-t border-dashed border-gray-400" />
        </div>
      </section>
    </div>
  );
}
