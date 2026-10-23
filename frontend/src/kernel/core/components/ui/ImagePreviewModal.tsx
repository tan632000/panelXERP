"use client";

import { Modal } from "@/kernel/core/components/ui/Modal";

import type { ReactNode } from "react";

/**
 * One image at full size — an avatar or a signature. The profile screen passes the actions its
 * owner may take; a list opens it for a quick look and passes none. The white backdrop is the
 * paper a transparent signature is printed on.
 */
export function ImagePreviewModal({
  imageUrl,
  title,
  actions,
  onClose,
}: {
  imageUrl: string;
  title: string;
  actions?: ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal isOpen onClose={onClose} title={title} showFooter={false}>
      <div className="flex flex-col items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={title}
          className="max-h-[60vh] w-full max-w-md rounded-xl bg-white object-contain"
        />
        {actions && (
          <div className="flex flex-wrap justify-center gap-2">{actions}</div>
        )}
      </div>
    </Modal>
  );
}
