"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { DateInput } from "@/kernel/core/components/ui/DateInput";
import { FormControl } from "@/kernel/core/components/ui/FormControl";
import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { Modal } from "@/kernel/core/components/ui/Modal";

import { REPRESENTATIVE_NAME_MAX } from "@plugins/delivery/acceptance/constants";
import { useCreateAcceptance } from "@plugins/delivery/acceptance/hooks/api/useAcceptance";
import { acceptanceFileProblem } from "@plugins/delivery/acceptance/utils/acceptance-file-problem";
import { RECEIPT_FILE_ACCEPT } from "@plugins/delivery/delivery-note/constants";

interface Props {
  orderId: number;
  onClose: () => void;
}

/** The customer's signed acceptance minutes: who signed, on which day, and the scanned files. */
export function AcceptanceUploadDialog({ orderId, onClose }: Readonly<Props>) {
  const t = useTranslations("delivery.acceptance.upload");
  const create = useCreateAcceptance(orderId);
  const [representativeName, setRepresentativeName] = useState("");
  const [signedDate, setSignedDate] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const problem = acceptanceFileProblem(files);
  const ready =
    representativeName.trim() !== "" &&
    signedDate !== "" &&
    files.length > 0 &&
    problem === null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("title")}
      submitLabel={t("submit")}
      submitDisabled={!ready || create.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate(
          {
            representativeName: representativeName.trim(),
            signedDate,
            files,
          },
          { onSuccess: onClose },
        );
      }}
    >
      <div className="flex flex-col gap-3">
        <FormInput
          label={t("representativeName")}
          aria-label={t("representativeName")}
          required
          value={representativeName}
          maxLength={REPRESENTATIVE_NAME_MAX}
          onChange={(event) => setRepresentativeName(event.target.value)}
        />
        <FormControl label={t("signedDate")} required>
          <DateInput value={signedDate} onChange={setSignedDate} />
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
