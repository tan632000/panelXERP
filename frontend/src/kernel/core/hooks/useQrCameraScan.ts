"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

import { createQrDecoder, drawVideoFrame } from "@/kernel/core/lib/qr-decoder";

/** A text read again within this window is the same QR still held in frame. */
const REPEAT_WINDOW_MS = 2000;

/** Pause between decode attempts — about twelve a second, light enough for a low-end phone. */
const SCAN_INTERVAL_MS = 80;

/** Share of the shorter video side read on a cropped attempt; covers the on-screen scan window. */
const CENTER_CROP = 0.8;

/** Every this many attempts reads the whole frame instead, for a code held off-centre. */
const FULL_FRAME_EVERY = 4;

/** A short buzz confirms a read on phones that vibrate; others ignore it. */
const DECODE_VIBRATION_MS = 60;

/**
 * Rear camera asked at full HD: a browser left to choose usually streams 640x480, where a QR shown
 * on a monitor spans too few pixels to decode. `ideal` never fails on a smaller camera.
 */
const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
};

type FocusCapabilities = MediaTrackCapabilities & { focusMode?: string[] };

/** Keeps refocusing as the code moves closer; cameras without the setting ignore the request. */
function keepFocusing(track: MediaStreamTrack | undefined): void {
  const capabilities = track?.getCapabilities?.() as
    FocusCapabilities | undefined;
  if (!track || !capabilities?.focusMode?.includes("continuous")) return;
  track
    .applyConstraints({
      advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
    })
    .catch(() => undefined);
}

type IosVideo = HTMLVideoElement & { webkitExitFullscreen?: () => void };

/**
 * Keeps the preview inside the page on iOS. Every inline-playback attribute is set on the element
 * itself — React writes `muted` only as a property — before the stream is attached, which is when
 * iOS decides. An in-app browser (Zalo, Messenger…) may still open its native "LIVE" player; that
 * player is closed at once and the preview resumed inline, sparing the user a manual back.
 * Returns the cleanup.
 */
function keepPreviewInline(video: IosVideo): () => void {
  video.muted = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("autoplay", "");
  video.setAttribute("disablepictureinpicture", "");
  video.removeAttribute("controls");

  const leaveNativePlayer = () => {
    video.webkitExitFullscreen?.();
    void video.play().catch(() => undefined);
  };
  video.addEventListener("webkitbeginfullscreen", leaveNativePlayer);
  return () =>
    video.removeEventListener("webkitbeginfullscreen", leaveNativePlayer);
}

/**
 * Streams the rear camera into `videoRef` while `active` and decodes it continuously, calling
 * `onDecode` once per newly read text. `ready` turns true once frames flow; `failed` when the
 * camera cannot be opened (no device, permission denied, insecure page).
 */
export function useQrCameraScan(
  active: boolean,
  videoRef: RefObject<HTMLVideoElement | null>,
  onDecode: (text: string) => void,
): { ready: boolean; failed: boolean } {
  const onDecodeRef = useRef(onDecode);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onDecodeRef.current = onDecode;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!active || !video) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = { text: "", at: 0 };
    let attempt = 0;
    const canvas = document.createElement("canvas");
    const releaseInline = keepPreviewInline(video);

    const report = (text: string) => {
      const now = Date.now();
      const repeat = text === last.text && now - last.at < REPEAT_WINDOW_MS;
      last = { text, at: now };
      if (repeat) return;
      navigator.vibrate?.(DECODE_VIBRATION_MS);
      onDecodeRef.current(text);
    };

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }
      // Closed while the permission prompt was open: release the camera at once.
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      keepFocusing(stream.getVideoTracks()[0]);
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const decode = await createQrDecoder();
      if (cancelled) return;
      setReady(true);

      const scan = async () => {
        if (cancelled) return;
        const fraction = ++attempt % FULL_FRAME_EVERY === 0 ? 1 : CENTER_CROP;
        if (drawVideoFrame(video, canvas, fraction)) {
          const text = await decode(canvas);
          if (cancelled) return;
          if (text) report(text);
        }
        timer = setTimeout(scan, SCAN_INTERVAL_MS);
      };
      void scan();
    };
    void start();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      releaseInline();
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      setReady(false);
      setFailed(false);
    };
  }, [active, videoRef]);

  return { ready, failed };
}
