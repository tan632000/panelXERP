"use client";

import { useEffect, useRef, useState } from "react";

import {
  FULL_FRAME,
  MIN_CROP,
  isFullFrame,
  lockedFrameFrom,
  moveFrame,
  oppositeCorner,
  rectBetween,
  resizeFrame,
} from "@/kernel/core/lib/image-canvas";

import type {
  CropHandle,
  NormalizedPoint,
  NormalizedRect,
} from "@/kernel/core/lib/image-canvas";
import type { PointerEvent as ReactPointerEvent } from "react";

const CORNER_HANDLES: Array<{ handle: CropHandle; className: string }> = [
  { handle: "nw", className: "left-0 top-0 cursor-nwse-resize" },
  { handle: "ne", className: "right-0 top-0 cursor-nesw-resize" },
  { handle: "sw", className: "bottom-0 left-0 cursor-nesw-resize" },
  { handle: "se", className: "bottom-0 right-0 cursor-nwse-resize" },
];

const EDGE_HANDLES: Array<{ handle: CropHandle; className: string }> = [
  {
    handle: "n",
    className: "left-1/2 top-0 -translate-x-1/2 cursor-ns-resize",
  },
  {
    handle: "s",
    className: "bottom-0 left-1/2 -translate-x-1/2 cursor-ns-resize",
  },
  {
    handle: "w",
    className: "left-0 top-1/2 -translate-y-1/2 cursor-ew-resize",
  },
  {
    handle: "e",
    className: "right-0 top-1/2 -translate-y-1/2 cursor-ew-resize",
  },
];

type CropDrag =
  | { mode: "draw"; start: NormalizedPoint }
  | { mode: "move"; start: NormalizedPoint; frame: NormalizedRect }
  | { mode: "resize"; handle: CropHandle; frame: NormalizedRect };

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

/**
 * An image with a crop frame over it. A handle resizes the frame, its inside moves it, and a
 * drag anywhere else draws a new one. With `aspect` set the frame keeps that pixel ratio and
 * resizes from its corners only; without it, a frame covering the whole image reports `null`.
 */
export function ImageCropFrame({
  image,
  crop,
  onChange,
  aspect,
  maxHeight = "16.5rem",
}: {
  image: HTMLCanvasElement;
  crop: NormalizedRect | null;
  /** Called once a drag ends, not on every move of it. */
  onChange: (crop: NormalizedRect | null) => void;
  /** Width over height the frame is held to, in pixels. */
  aspect?: number;
  maxHeight?: string;
}) {
  const displayRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<CropDrag | null>(null);
  const [draft, setDraft] = useState<NormalizedRect | null>(null);

  useEffect(() => {
    const display = displayRef.current;
    const ctx = display?.getContext("2d");
    if (!display || !ctx) return;
    display.width = image.width;
    display.height = image.height;
    ctx.drawImage(image, 0, 0);
  }, [image]);

  const frameAt = (drag: CropDrag, point: NormalizedPoint): NormalizedRect => {
    if (drag.mode === "move") return moveFrame(drag.frame, drag.start, point);
    if (aspect === undefined) {
      return drag.mode === "draw"
        ? rectBetween(drag.start, point)
        : resizeFrame(drag.frame, drag.handle, point);
    }
    const anchor =
      drag.mode === "draw"
        ? drag.start
        : oppositeCorner(drag.frame, drag.handle);
    return lockedFrameFrom(anchor, point, aspect, image.width, image.height);
  };

  const pointFrom = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFrom(event);
    const frame = crop ?? FULL_FRAME;
    const target = (event.target as HTMLElement).dataset.cropHandle;
    if (target === "move") {
      dragRef.current = { mode: "move", start: point, frame };
    } else if (target) {
      dragRef.current = { mode: "resize", handle: target as CropHandle, frame };
    } else {
      dragRef.current = { mode: "draw", start: point };
    }
    setDraft(frameAt(dragRef.current, point));
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag) setDraft(frameAt(drag, pointFrom(event)));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const next = frameAt(drag, pointFrom(event));
    setDraft(null);
    if (next.width < MIN_CROP || next.height < MIN_CROP) return;
    onChange(aspect === undefined && isFullFrame(next) ? null : next);
  };

  const shown = draft ?? crop ?? FULL_FRAME;
  const handles =
    aspect === undefined
      ? [...CORNER_HANDLES, ...EDGE_HANDLES]
      : CORNER_HANDLES;

  return (
    <div
      className="relative overflow-hidden"
      style={{
        aspectRatio: `${image.width} / ${image.height}`,
        width: `min(100%, calc(${maxHeight} * ${image.width / image.height}))`,
      }}
    >
      <canvas ref={displayRef} className="block size-full" />
      <div
        role="presentation"
        className="absolute inset-0 cursor-crosshair touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span
          data-crop-handle="move"
          className="absolute cursor-move border-2 border-white"
          style={{
            left: `${shown.x * 100}%`,
            top: `${shown.y * 100}%`,
            width: `${shown.width * 100}%`,
            height: `${shown.height * 100}%`,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
          }}
        >
          {/* Rule-of-thirds guides, for placing a face or a signature. */}
          <span className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, cell) => (
              <span key={cell} className="border border-white/25" />
            ))}
          </span>
          {handles.map(({ handle, className }) => (
            <span
              key={handle}
              data-crop-handle={handle}
              className={`absolute size-3.5 rounded-full border-2 border-brand bg-white shadow ${className}`}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
