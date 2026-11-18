"use client";

import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { Button } from "@/kernel/core/components/ui/Button";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { FormInput } from "@/kernel/core/components/ui/FormInput";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { PageHeader } from "@/kernel/core/components/ui/PageHeader";
import { useQueryErrorToast } from "@/kernel/core/hooks/useQueryErrorToast";

import { QC_CHECKLIST_NAME_MAX } from "@plugins/delivery/qc-checklist/constants";
import {
  useAddChecklistItem,
  useChecklistItems,
  useReorderChecklistItems,
  useUpdateChecklistItem,
} from "@plugins/delivery/qc-checklist/hooks/api/useQcChecklist";
import { QcChecklistPermission } from "@plugins/delivery/qc-checklist/permissions/qc-checklist-permission.keys";

import { ChecklistItemRow } from "./ChecklistItemRow";

/**
 * The checklist template every QC round copies. A production manager adds, renames, hides or
 * shows and reorders items; anyone else with the read permission sees the active ones.
 */
export function ChecklistTemplatePage() {
  const t = useTranslations("delivery");
  const { can } = useAuth();
  const canManage = can(QcChecklistPermission.manage);
  const { data, isLoading, isError } = useChecklistItems(canManage);
  useQueryErrorToast(isError, t("checklist.loadError"));
  const add = useAddChecklistItem();
  const update = useUpdateChecklistItem();
  const reorder = useReorderChecklistItems();
  const [name, setName] = useState("");

  const items = data ?? [];
  const busy = update.isPending || reorder.isPending;
  const newName = name.trim();

  const move = (index: number, offset: -1 | 1) => {
    const ids = items.map((item) => item.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    reorder.mutate(ids);
  };

  return (
    <>
      <PageHeader
        title={t("checklist.title")}
        description={t("checklist.description")}
      />
      <div className="flex flex-col gap-4 p-5">
        {canManage ? (
          <form
            className="flex max-w-xl items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (newName === "") return;
              add.mutate(newName, { onSuccess: () => setName("") });
            }}
          >
            <div className="flex-1">
              <FormInput
                label={t("checklist.addLabel")}
                labelHidden
                placeholder={t("checklist.addPlaceholder")}
                maxLength={QC_CHECKLIST_NAME_MAX}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={newName === "" || add.isPending}
            >
              {t("checklist.add")}
            </Button>
          </form>
        ) : null}
        {isLoading ? <LoadingState /> : null}
        {!isLoading && items.length === 0 ? (
          <EmptyState icon="clipboard-list" message={t("checklist.none")} />
        ) : null}
        {!isLoading && items.length > 0 ? (
          <ol className="flex max-w-3xl flex-col gap-2">
            {items.map((item, index) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                index={index}
                isLast={index === items.length - 1}
                canManage={canManage}
                busy={busy}
                onMove={(offset) => move(index, offset)}
                onToggle={() =>
                  update.mutate({ id: item.id, active: !item.active })
                }
                onRename={(next, done) =>
                  update.mutate({ id: item.id, name: next }, { onSuccess: done })
                }
              />
            ))}
          </ol>
        ) : null}
      </div>
    </>
  );
}
