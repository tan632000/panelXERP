"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { cn } from "@/kernel/core/lib/cn";

interface QrImageProps {
  text: string;
  /** Alternative text of the image. */
  alt: string;
  size?: number;
  className?: string;
}

/** A bare QR image of `text`, with a pulsing placeholder until it has been drawn. */
export function QrImage({ text, alt, size = 96, className }: QrImageProps) {
  const [svgUrl, setSvgUrl] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toString(text, {
      type: "svg",
      width: size,
      margin: 1,
      color: { dark: "#1e293b", light: "#ffffff" },
    })
      .then((svg) => {
        if (active) {
          setSvgUrl(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
        }
      })
      // A QR that cannot be rendered leaves the placeholder; the page must not break.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [text, size]);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {svgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={svgUrl}
          alt={alt}
          width={size}
          height={size}
          className="block"
        />
      ) : (
        <span className="size-full animate-pulse bg-slate-100" />
      )}
    </span>
  );
}
