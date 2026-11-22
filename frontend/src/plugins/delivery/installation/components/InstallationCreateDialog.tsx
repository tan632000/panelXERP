"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { DateInput } from "@/kernel/core/components/ui/DateInput";
import { FormControl } from "@/kernel/core/components/ui/FormControl";
import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { FormTextArea } from "@/kernel/core/components/ui/FormTextArea";
import { Modal } from "@/kernel/core/components/ui/Modal";

import {
  INSTALLATION_NOTE_MAX,
  PERSON_IN_CHARGE_MAX,
  SITE_ADDRESS_MAX,
} from "@plugins/delivery/installation/constants";
import { useCreateInstallation } from "@plugins/delivery/installation/hooks/api/useInstallation";

interface Props {
  orderId: number;
  /** The order's project site (else customer) address the form starts with. */
  siteAddress: string | null;
  onClose: () => void;
}

/** Plans the installation of an order; every field is optional, the address starts as the order's. */
export function InstallationCreateDialog({
  orderId,
  siteAddress,
  onClose,
}: Readonly<Props>) {
  const t = useTranslations("delivery.installation");
  const create = useCreateInstallation(orderId);
  const [address, setAddress] = useState(siteAddress ?? "");
  const [plannedDate, setPlannedDate] = useState("");
  const [personInCharge, setPersonInCharge] = useState("");
  const [note, setNote] = useState("");

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("create.title")}
      submitLabel={t("create.submit")}
      submitDisabled={create.isPending}
      onSubmit={(event) => {
        event.preventDefault();
        const text = {
          siteAddress: address.trim(),
          personInCharge: personInCharge.trim(),
          note: note.trim(),
        };
        create.mutate(
          {
            ...(text.siteAddress ? { siteAddress: text.siteAddress } : {}),
            ...(plannedDate ? { plannedDate } : {}),
            ...(text.personInCharge
              ? { personInCharge: text.personInCharge }
              : {}),
            ...(text.note ? { note: text.note } : {}),
          },
          { onSuccess: onClose },
        );
      }}
    >
      <div className="flex flex-col gap-3">
        <FormInput
          label={t("fields.siteAddress")}
          aria-label={t("fields.siteAddress")}
          value={address}
          maxLength={SITE_ADDRESS_MAX}
          onChange={(event) => setAddress(event.target.value)}
        />
        <FormControl label={t("fields.plannedDate")}>
          <DateInput value={plannedDate} onChange={setPlannedDate} />
        </FormControl>
        <FormInput
          label={t("fields.personInCharge")}
          aria-label={t("fields.personInCharge")}
          value={personInCharge}
          maxLength={PERSON_IN_CHARGE_MAX}
          onChange={(event) => setPersonInCharge(event.target.value)}
        />
        <FormTextArea
          label={t("fields.note")}
          aria-label={t("fields.note")}
          value={note}
          maxLength={INSTALLATION_NOTE_MAX}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
    </Modal>
  );
}
