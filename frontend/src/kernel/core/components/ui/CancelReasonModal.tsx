"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { FormTextArea } from "@/kernel/core/components/ui/FormTextArea";
import { Modal } from "@/kernel/core/components/ui/Modal";

export interface CancelReasonModalProps {
  isOpen: boolean;
  title: string;
  /**
   * What cancelling will cost, shown above the field — for a document whose cancellation
   * leaves something behind that this dialog does not undo. Omitted when there is nothing to
   * warn about, so the dialog stays as short as the decision.
   */
  description?: React.ReactNode;
  /** Label above the textarea, and the placeholder inside it. */
  reasonLabel: string;
  placeholder?: string;
  submitLabel: string;
  /** Shown when the reader submits nothing, and when they exceed `maxLength`. */
  requiredMessage: string;
  maxLengthMessage: string;
  maxLength: number;
  pending?: boolean;
  onClose: () => void;
  onConfirm: (cancelReason: string) => void;
}

/**
 * Cancel-with-required-reason, the mock's shared `openHuyReasonModal`. Every document that
 * can be cancelled records why, so this lives in the kernel rather than being copied per
 * plugin; a caller supplies only its own copy.
 */
export function CancelReasonModal({
  isOpen,
  title,
  description,
  reasonLabel,
  placeholder,
  submitLabel,
  requiredMessage,
  maxLengthMessage,
  maxLength,
  pending = false,
  onClose,
  onConfirm,
}: Readonly<CancelReasonModalProps>) {
  const tCommon = useTranslations("common");
  const [reason, setReason] = useState("");
  // Resets the reason the moment the modal opens (or closes), without an effect: the
  // "adjust state during render" pattern, rather than a `useEffect` calling `setState`
  // unconditionally on every open/close.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    setReason("");
  }

  const tooLong = reason.length > maxLength;
  const isEmpty = reason.trim().length === 0;
  const reasonError = (() => {
    if (tooLong) return maxLengthMessage;
    // Silent until the reader has typed something and then cleared it — an untouched field
    // is not yet an error.
    if (isEmpty && reason.length > 0) return requiredMessage;
    return undefined;
  })();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      submitLabel={submitLabel}
      cancelLabel={tCommon("cancel")}
      submitDisabled={pending || isEmpty || tooLong}
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm(reason.trim());
      }}
    >
      {description ? (
        <p className="mb-3 rounded-md bg-warning-bg px-3 py-2 text-xs leading-relaxed text-warning-text">
          {description}
        </p>
      ) : null}
      <FormTextArea
        label={reasonLabel}
        placeholder={placeholder}
        value={reason}
        required
        error={reasonError}
        onChange={(event) => setReason(event.target.value)}
      />
    </Modal>
  );
}
