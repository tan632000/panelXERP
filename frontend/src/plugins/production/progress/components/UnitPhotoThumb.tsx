"use client";

import React, { useEffect, useRef } from "react";

import { usePhotoContent } from "@plugins/production/progress/hooks/api/useProgress";

import type { UnitPhoto } from "@plugins/production/progress/types";

/**
 * One photo as a thumbnail. The image route wants the caller's token, so the bytes are read
 * through the API client and shown from an object URL; clicking opens the full image.
 *
 * The URL is made and revoked by the effect and handed to the image through a ref, so leaving
 * the page frees the image and a remount (StrictMode included) makes a fresh one.
 */
export function UnitPhotoThumb({ photo }: Readonly<{ photo: UnitPhoto }>) {
  const blob = usePhotoContent(photo.id).data;
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
      className="size-24 overflow-hidden rounded-[10px] border border-border-secondary bg-surface-secondary"
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
