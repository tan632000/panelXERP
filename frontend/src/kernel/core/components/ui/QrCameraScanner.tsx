"use client";

import { useTranslations } from "next-intl";
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/kernel/core/components/ui/Icon";
import { usePortalContainer } from "@/kernel/core/hooks/usePortalContainer";
import { useQrCameraScan } from "@/kernel/core/hooks/useQrCameraScan";
import { cn } from "@/kernel/core/lib/cn";
import { decodeQrImageFile } from "@/kernel/core/lib/qr-decoder";

const GLASS_CLASS = "bg-white/15 ring-1 ring-white/20 backdrop-blur-md";

const CORNER_CLASS =
  "absolute size-11 border-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.75)]";

const ACTION_CLASS =
  "flex min-w-24 cursor-pointer flex-col items-center gap-2 border-none bg-transparent text-xs font-semibold text-white";

const ACTION_ICON_CLASS =
  "flex size-14 items-center justify-center rounded-full transition-colors";

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

export interface QrCameraScannerProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called once per newly decoded text; the scanner keeps running until the caller closes it. */
  onDecode: (text: string) => void;
  title?: string;
  /** Overlay area for the caller's match message and buttons. */
  children?: ReactNode;
}

/**
 * Full-screen rear-camera QR scanner that decodes continuously, with no shutter button. The
 * viewfinder dims everything but a square scan window, as banking and chat apps do. The bottom
 * bar switches the torch for a dark warehouse and reads a QR already saved as a photo; the photo
 * path also works when the camera cannot be opened.
 */
export function QrCameraScanner({
  isOpen,
  onClose,
  onDecode,
  title,
  children,
}: QrCameraScannerProps) {
  const t = useTranslations("common");
  const container = usePortalContainer();
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDecodeRef = useRef(onDecode);
  const [torchOn, setTorchOn] = useState(false);
  const [torchUnsupported, setTorchUnsupported] = useState(false);
  const [readingImage, setReadingImage] = useState(false);
  const [imageUnreadable, setImageUnreadable] = useState(false);
  const active = isOpen && container !== null;
  const { ready: cameraReady, failed } = useQrCameraScan(
    active,
    videoRef,
    onDecode,
  );

  useEffect(() => {
    onDecodeRef.current = onDecode;
  });

  // The torch goes out with the stream, and notices belong to the session that raised them.
  useEffect(() => {
    if (!active) return;
    return () => {
      setTorchOn(false);
      setTorchUnsupported(false);
      setImageUnreadable(false);
    };
  }, [active]);

  if (!active) return null;

  /**
   * The torch is read off the live track when tapped, not when the camera starts: several
   * Android cameras only report it once frames are flowing. iOS browsers report none.
   */
  const toggleTorch = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks?.()[0];
    const capabilities = track?.getCapabilities?.() as
      TorchCapabilities | undefined;
    if (!track || !capabilities?.torch) {
      setTorchUnsupported(true);
      return;
    }
    const next = !torchOn;
    track
      .applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      })
      .then(() => {
        setTorchOn(next);
        setTorchUnsupported(false);
      })
      .catch(() => setTorchUnsupported(true));
  };

  const handleImagePicked = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so picking the same photo again still fires a change.
    event.target.value = "";
    if (!file) return;
    setImageUnreadable(false);
    setReadingImage(true);
    // A picked photo is a deliberate read, so it skips the repeat window of the live camera.
    void decodeQrImageFile(file).then((text) => {
      setReadingImage(false);
      if (text) onDecodeRef.current(text);
      else setImageUnreadable(true);
    });
  };

  let notice: string | null = null;
  if (imageUnreadable) notice = t("qrCamera.imageUnreadable");
  else if (torchUnsupported) notice = t("qrCamera.torchUnsupported");

  return createPortal(
    <div className="fixed inset-0 z-[110] overflow-hidden bg-slate-950 text-white">
      <video
        ref={videoRef}
        muted
        playsInline
        className="absolute inset-0 size-full object-cover"
      />
      <div className="relative flex h-full flex-col">
        <div className="relative z-20 grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-[max(env(safe-area-inset-top),0.875rem)]">
          <button
            type="button"
            aria-label={t("qrCamera.close")}
            title={t("qrCamera.close")}
            onClick={onClose}
            className={cn(
              GLASS_CLASS,
              "flex size-11 cursor-pointer items-center justify-center rounded-full border-none text-white hover:bg-white/25",
            )}
          >
            <Icon name="chevron-left" size={22} />
          </button>
          <span className="truncate text-center text-base font-bold tracking-tight drop-shadow">
            {title ?? t("qrCamera.title")}
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          {failed ? (
            <div
              role="alert"
              className="relative z-20 flex max-w-sm flex-col items-center gap-3 rounded-3xl bg-white/95 px-6 py-5 text-center text-sm text-text-primary shadow-2xl"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <Icon name="camera" size={24} />
              </span>
              {t("qrCamera.unavailable")}
            </div>
          ) : (
            <>
              {/* The window's huge shadow is the dimmed surround; it is not hit-testable. */}
              <div
                data-testid="qr-camera-frame"
                className="relative z-10 aspect-square w-[min(76vw,50vh,320px)] rounded-[28px] shadow-[0_0_0_100vmax_rgba(2,6,23,0.62)]"
              >
                <span
                  className={cn(
                    CORNER_CLASS,
                    "left-0 top-0 rounded-tl-[28px] border-l-4 border-t-4",
                  )}
                />
                <span
                  className={cn(
                    CORNER_CLASS,
                    "right-0 top-0 rounded-tr-[28px] border-r-4 border-t-4",
                  )}
                />
                <span
                  className={cn(
                    CORNER_CLASS,
                    "bottom-0 left-0 rounded-bl-[28px] border-b-4 border-l-4",
                  )}
                />
                <span
                  className={cn(
                    CORNER_CLASS,
                    "bottom-0 right-0 rounded-br-[28px] border-b-4 border-r-4",
                  )}
                />
                {cameraReady ? (
                  <div className="absolute inset-1 overflow-hidden rounded-[24px] motion-reduce:hidden">
                    <div className="absolute inset-x-4 h-16 -translate-y-full [animation:qr-scan-line_2.4s_ease-in-out_infinite]">
                      <div className="h-full bg-gradient-to-t from-amber-400/35 to-transparent" />
                      <div className="h-0.5 rounded-full bg-gradient-to-r from-transparent via-amber-300 to-transparent shadow-[0_0_12px_2px_rgba(251,191,36,0.8)]" />
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white/80">
                    <span className="size-8 animate-spin rounded-full border-[3px] border-white/25 border-t-amber-400" />
                    {t("qrCamera.starting")}
                  </div>
                )}
              </div>
              <p
                className={cn(
                  GLASS_CLASS,
                  "relative z-20 max-w-xs rounded-full px-4 py-2 text-center text-sm font-medium",
                )}
              >
                {t("qrCamera.hint")}
              </p>
            </>
          )}
        </div>

        <div className="relative z-20 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <div className="mx-auto flex max-w-md flex-col gap-3 rounded-3xl bg-black/45 p-4 ring-1 ring-white/10 backdrop-blur-xl">
            {notice ? (
              <p
                role="alert"
                className="rounded-xl bg-white/95 px-3 py-2 text-center text-sm font-semibold text-danger-text"
              >
                {notice}
              </p>
            ) : null}
            {children}
            <div className="flex items-start justify-center gap-10">
              {cameraReady ? (
                <button
                  type="button"
                  aria-pressed={torchOn}
                  onClick={toggleTorch}
                  className={ACTION_CLASS}
                >
                  <span
                    className={cn(
                      ACTION_ICON_CLASS,
                      torchOn
                        ? "bg-amber-400 text-slate-900 shadow-[0_0_24px_rgba(251,191,36,0.7)]"
                        : cn(GLASS_CLASS, "hover:bg-white/25"),
                    )}
                  >
                    <Icon name="bolt" size={26} />
                  </span>
                  {t(torchOn ? "qrCamera.torchOff" : "qrCamera.torchOn")}
                </button>
              ) : null}
              <label
                className={cn(
                  ACTION_CLASS,
                  readingImage && "pointer-events-none opacity-60",
                )}
              >
                <span
                  className={cn(
                    ACTION_ICON_CLASS,
                    GLASS_CLASS,
                    "hover:bg-white/25",
                  )}
                >
                  {readingImage ? (
                    <span className="size-6 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
                  ) : (
                    <Icon name="photo" size={26} />
                  )}
                </span>
                {t(
                  readingImage ? "qrCamera.readingImage" : "qrCamera.fromImage",
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={readingImage}
                  onChange={handleImagePicked}
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>,
    container,
  );
}
