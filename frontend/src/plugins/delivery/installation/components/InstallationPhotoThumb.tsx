"use client";

import React, { useEffect, useRef } from "react";

import { useInstallationPhotoContent } from "@plugins/delivery/installation/hooks/api/useInstallation";

import type { InstallationPhoto } from "@plugins/delivery/installation/types";

/**
 * One photo as a thumbnail. The image route wants the caller's token, so the bytes are read
 * through the API client and shown from an object URL; clicking opens the full image.
 * The URL is made and revoked by the effect, so leaving the page frees the image.
 */
export function InstallationPhotoThumb({
  photo,
}: Readonly<{ photo: InstallationPhoto }>) {
  const blob = useInstallationPhotoContent(photo.id).data;
  const image = useRef<HTMLImageElement>(null);
  const url = useRef<string | null>(null);

  useEffect(() => {
    if (!blob) return undefined;
    const objectUrl = URL.createObjectURL(blob);
    url.current = objectUrl;
    if (image.current) image.current.src = objectUrl;
    return () => {
      url.current = null;
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  return (
    <button
      type="button"
      title={photo.fileName}
      className="size-20 overflow-hidden rounded-[10px] border border-border-secondary bg-surface-secondary"
      disabled={!blob}
      onClick={() => {
        if (url.current) window.open(url.current, "_blank", "noopener");
      }}
    >
      {blob ? (
        // A blob URL cannot go through the Next image optimiser.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={image}
          alt={photo.fileName}
          className="size-full object-cover"
        />
      ) : null}
    </button>
  );
}
