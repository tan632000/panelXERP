"use client";

import { useCallback, useEffect, useRef } from "react";

import { paintSignatureStrokes } from "@/kernel/core/auth/signature-image";

import type {
  SignaturePoint,
  SignatureStroke,
} from "@/kernel/core/auth/signature-image";
import type { PointerEvent as ReactPointerEvent } from "react";

/** Mouse and touch report no usable pressure, so they draw at the pen's midpoint width. */
const DEFAULT_PRESSURE = 0.5;

function pointFrom(
  event: PointerEvent | ReactPointerEvent<HTMLCanvasElement>,
  rect: DOMRect,
): SignaturePoint {
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    pressure:
      event.pointerType === "pen" && event.pressure > 0
        ? event.pressure
        : DEFAULT_PRESSURE,
  };
}

/**
 * A drawing surface for mouse, touch and pen alike — pointer events cover all three. The
 * strokes are kept as points, not pixels, so a resize redraws them sharp and the export can
 * render them at print resolution.
 */
export function SignaturePad({
  strokes,
  onChange,
  color,
  placeholder,
  ariaLabel,
}: {
  strokes: SignatureStroke[];
  onChange: (strokes: SignatureStroke[]) => void;
  color: string;
  placeholder: string;
  ariaLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  // Several pointer moves can land before the parent re-renders with the last change, so the
  // handlers extend the latest strokes rather than the ones this render was given.
  const strokesRef = useRef(strokes);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  const commit = (next: SignatureStroke[]) => {
    strokesRef.current = next;
    onChange(next);
  };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintSignatureStrokes(ctx, strokes, color);
  }, [strokes, color]);

  useEffect(() => {
    redraw();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const rect = event.currentTarget.getBoundingClientRect();
    commit([...strokesRef.current, [pointFrom(event, rect)]]);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const latest = strokesRef.current;
    if (!drawingRef.current || latest.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // A fast hand moves further between frames than one event reports; the coalesced
    // samples fill that gap so a quick flourish stays a curve instead of a polyline.
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const points = (samples.length > 0 ? samples : [event.nativeEvent]).map(
      (sample) => pointFrom(sample, rect),
    );
    const current = latest[latest.length - 1];
    commit([...latest.slice(0, -1), [...current, ...points]]);
  };

  const stopDrawing = () => {
    drawingRef.current = false;
  };

  return (
    <div className="relative h-52 w-full overflow-hidden rounded-lg border border-border-secondary bg-white">
      {strokes.length === 0 && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-text-tertiary">
          {placeholder}
        </span>
      )}
      <span className="pointer-events-none absolute bottom-10 left-6 right-6 border-b border-dashed border-border-secondary" />
      <canvas
        ref={canvasRef}
        aria-label={ariaLabel}
        className="relative block size-full cursor-crosshair touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
      />
    </div>
  );
}
