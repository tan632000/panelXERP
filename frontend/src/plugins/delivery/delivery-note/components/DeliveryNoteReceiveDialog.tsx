"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { DateInput } from "@/kernel/core/components/ui/DateInput";
import { FormControl } from "@/kernel/core/components/ui/FormControl";
import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { Modal } from "@/kernel/core/components/ui/Modal";

import {
  RECEIPT_FILE_ACCEPT,
  RECEIPT_FILE_EXTENSIONS,
  RECEIPT_FILE_MAX_BYTES,
  RECEIPT_FILE_MAX_COUNT,
  RECEIVER_NAME_MAX,
} from "@plugins/delivery/delivery-note/constants";
import { useReceiveDeliveryNote } from "@plugins/delivery/delivery-note/hooks/api/useDeliveryNote";

interface Props {
  noteId: number;
  onClose: () => void;
}

type FileProblem = "count" | "type" | "size";

/** What is wrong with the picked handover files, if anything; the server repeats the check. */
function fileProblem(files: readonly File[]): FileProblem | null {
  if (files.length > RECEIPT_FILE_MAX_COUNT) return "count";
  const extensionOf = (file: File) =>
    file.name.split(".").pop()?.toLowerCase() ?? "";
  if (
    files.some(
      (file) =>
        !(RECEIPT_FILE_EXTENSIONS as readonly string[]).includes(
          extensionOf(file),
        ),
    )
  ) {
    return "type";
  }
  return files.some((file) => file.size > RECEIPT_FILE_MAX_BYTES)
    ? "size"
    : null;
}

/** The customer's receipt: who took the cabinets, on which day, and the scanned handover minutes. */
export function DeliveryNoteReceiveDialog({ noteId, onClose }: Readonly<Props>) {
  const t = useTranslations("delivery.note.receive");
  const receive = useReceiveDeliveryNote();
  const [receiverName, setReceiverName] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const problem = fileProblem(files);
  const ready =
    receiverName.trim() !== "" &&
    receivedDate !== "" &&
    files.length > 0 &&
    problem === null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("title")}
      submitLabel={t("submit")}
      submitDisabled={!ready || receive.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        receive.mutate(
          {
            id: noteId,
            receiverName: receiverName.trim(),
            receivedDate,
            files,
          },
          { onSuccess: onClose },
        );
      }}
    >
      <div className="flex flex-col gap-3">
        <FormInput
          label={t("receiverName")}
          aria-label={t("receiverName")}
          required
          value={receiverName}
          maxLength={RECEIVER_NAME_MAX}
          onChange={(event) => setReceiverName(event.target.value)}
        />
        <FormControl label={t("receivedDate")} required>
          <DateInput value={receivedDate} onChange={setReceivedDate} />
        </FormControl>
        <FormControl
          label={t("files")}
          required
          error={problem ? t(`problems.${problem}`) : undefined}
        >
          <input
            type="file"
            multiple
            aria-label={t("files")}
            accept={RECEIPT_FILE_ACCEPT}
            className="text-sm"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
          <span className="text-xs text-text-tertiary">{t("fileHint")}</span>
        </FormControl>
      </div>
    </Modal>
  );
}
