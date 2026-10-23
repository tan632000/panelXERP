"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

import api from "@/kernel/core/api/api";
import { useAuth } from "@/kernel/core/auth/AuthContext";
import { AvatarEditorModal } from "@/kernel/core/auth/components/AvatarEditorModal";
import { Button } from "@/kernel/core/components/ui/Button";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { ImagePreviewModal } from "@/kernel/core/components/ui/ImagePreviewModal";
import { apiRoutes } from "@/kernel/core/constants/apiRoutes";
import { useNotification } from "@/kernel/core/contexts/NotificationContext";
import { loadImageForEditing } from "@/kernel/core/lib/image-canvas";

import type { MeResponse } from "@/kernel/core/auth/types";

/** Formats every browser can decode into a canvas for editing; HEIC is not one of them. */
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * A raw phone photo, before the editor cuts it down: what reaches the server is a 512px JPEG
 * well under its 2MB limit, so the picked file itself may be far larger.
 */
const MAX_BYTES = 15 * 1024 * 1024;

export function ProfileAvatar({
  avatarUrl,
  initials,
}: {
  avatarUrl?: string | null;
  initials: string;
}) {
  const t = useTranslations("auth");
  const { applySessionUpdate } = useAuth();
  const { showSuccess, showError } = useNotification();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<HTMLCanvasElement | null>(null);
  const [viewing, setViewing] = useState(false);

  const handleFile = async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      showError(t("avatarTypeInvalid"));
      return;
    }
    if (file.size > MAX_BYTES) {
      showError(t("avatarTooLarge"));
      return;
    }

    setBusy(true);
    try {
      setEditing(await loadImageForEditing(file));
      setViewing(false);
    } catch {
      showError(t("imageEditor.photoUnreadable"));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      const { data } = await api.delete<MeResponse>(apiRoutes.auth.avatar);
      applySessionUpdate(data);
      setViewing(false);
      showSuccess(t("avatarRemoved"));
    } catch {
      showError(t("requestFailed"));
    } finally {
      setBusy(false);
    }
  };

  // Busy spins; over a picture the control opens it, over the empty frame it picks one.
  let overlayIcon = avatarUrl ? "eye" : "photo";
  if (busy) overlayIcon = "refresh";

  return (
    <div className="group relative -mt-10 shrink-0">
      <span className="inline-flex size-20 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-50 to-brand-light text-2xl font-bold text-brand shadow-md ring-4 ring-surface-primary transition-shadow duration-200 group-hover:shadow-lg">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={t("avatar")}
            className="size-full object-cover"
          />
        ) : (
          initials
        )}
      </span>
      {avatarUrl && (
        <button
          type="button"
          onClick={() => void handleRemove()}
          disabled={busy}
          title={t("removeAvatar")}
          aria-label={t("removeAvatar")}
          className="absolute -right-1.5 -top-1.5 z-10 inline-flex size-6 cursor-pointer items-center justify-center rounded-full bg-surface-primary text-text-tertiary shadow-md ring-1 ring-border-secondary transition duration-200 hover:scale-110 hover:bg-danger-bg hover:text-danger-text hover:ring-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-text active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon name="x" size={12} />
        </button>
      )}
      {/* Over a picture the control only surfaces on hover, and opens the picture itself;
          with the frame still empty it is the one thing saying the frame can be filled, so it
          stays visible and goes straight to picking a photo. */}
      <button
        type="button"
        onClick={() =>
          avatarUrl ? setViewing(true) : inputRef.current?.click()
        }
        disabled={busy}
        title={avatarUrl ? t("viewAvatar") : t("changeAvatar")}
        aria-label={avatarUrl ? t("viewAvatar") : t("changeAvatar")}
        className={`absolute inset-0 inline-flex cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-t from-black/60 to-black/25 text-white transition-opacity duration-200 focus-visible:opacity-100 focus-visible:outline-none disabled:cursor-not-allowed group-hover:opacity-100 ${
          avatarUrl ? "opacity-0" : "opacity-100"
        }`}
      >
        <span className="inline-flex size-9 scale-90 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/40 backdrop-blur-[2px] transition-transform duration-200 group-hover:scale-100">
          <Icon
            name={overlayIcon}
            size={18}
            className={busy ? "animate-spin" : undefined}
          />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared straight away, so picking the same file twice still fires a change.
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      {viewing && avatarUrl && (
        <ImagePreviewModal
          imageUrl={avatarUrl}
          title={t("avatar")}
          onClose={() => setViewing(false)}
          actions={
            <>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                <Icon name="photo" size={16} />
                {t("changeAvatar")}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void handleRemove()}
              >
                <Icon name="trash" size={16} />
                {t("removeAvatar")}
              </Button>
            </>
          }
        />
      )}
      {editing && (
        <AvatarEditorModal photo={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
