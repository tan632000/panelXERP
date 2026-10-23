"use client";

import { useTranslations } from "next-intl";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import {
  DETAIL_ACTION_ROW_CLASS,
  DetailPanelActionButton,
} from "@/kernel/core/components/ui/DetailPanelActionButton";

export interface DetailPanelActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  writePermission?: string;
  deletePermission?: string;
  /**
   * Greys out the edit action for a record the reader may not change right now — a lot that is
   * closed or cancelled, say. `editDisabledReason` becomes the button's tooltip, so the reason
   * is stated rather than left to be guessed.
   */
  editDisabled?: boolean;
  editDisabledReason?: string;
  deleteDisabled?: boolean;
  deleteDisabledReason?: string;
}

export function DetailPanelActions({
  onEdit,
  onDelete,
  writePermission,
  deletePermission,
  editDisabled = false,
  editDisabledReason,
  deleteDisabled = false,
  deleteDisabledReason,
}: Readonly<DetailPanelActionsProps>) {
  const tCommon = useTranslations("common");
  const { can } = useAuth();

  const canEdit = Boolean(onEdit && (!writePermission || can(writePermission)));
  const canDelete = Boolean(
    onDelete && (!deletePermission || can(deletePermission)),
  );

  if (!canEdit && !canDelete) {
    return null;
  }

  return (
    <div className={DETAIL_ACTION_ROW_CLASS}>
      {canEdit ? (
        <DetailPanelActionButton
          icon="edit"
          iconOnly
          disabled={editDisabled}
          aria-label={tCommon("edit")}
          title={editDisabled ? editDisabledReason : tCommon("edit")}
          onClick={onEdit}
        />
      ) : null}
      {canDelete ? (
        <DetailPanelActionButton
          variant="danger"
          icon="trash"
          iconOnly
          disabled={deleteDisabled}
          aria-label={tCommon("delete")}
          title={deleteDisabled ? deleteDisabledReason : tCommon("delete")}
          onClick={onDelete}
        />
      ) : null}
    </div>
  );
}
