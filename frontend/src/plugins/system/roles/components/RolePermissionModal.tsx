"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Button } from "@/kernel/core/components/ui/Button";
import { EmptyState } from "@/kernel/core/components/ui/EmptyState";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { Modal } from "@/kernel/core/components/ui/Modal";
import { SearchInput } from "@/kernel/core/components/ui/SearchInput";

import {
  usePermissionCatalog,
  useUpdateRolePermissions,
} from "@plugins/system/roles/hooks/api/useSystemRoles";
import { usePermissionMatrix } from "@plugins/system/roles/hooks/usePermissionMatrix";

import { PermissionMatrix } from "./PermissionMatrix";

import type { SystemRole } from "@plugins/system/roles/types";

export function RolePermissionModal({
  isOpen,
  onClose,
  role,
  roleLabel,
}: {
  isOpen: boolean;
  onClose: () => void;
  role: SystemRole;
  /** The role's name in the reader's language; the stored name is English. */
  roleLabel: string;
}) {
  const t = useTranslations("system.roles");
  const { data, isLoading } = usePermissionCatalog(isOpen);
  const catalog = useMemo(() => data ?? [], [data]);
  const updatePermissions = useUpdateRolePermissions();

  // The list mounts this modal per role, so the role's own permissions are the initial
  // selection rather than something an effect copies in after the first render.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(role.permissions),
  );
  const [search, setSearch] = useState("");
  /**
   * Which modules are folded, or `null` while nobody has folded one by hand.
   *
   * Ninety-odd rows open at once is a wall of checkboxes, so until the reader folds
   * something the state is derived rather than stored: a module the role grants nothing in
   * starts closed. Deriving it means the default still holds once the catalogue arrives,
   * with no effect chasing the data.
   */
  const [folded, setFolded] = useState<Set<string> | null>(null);

  const { rows, blocks, emptyModules } = usePermissionMatrix({
    catalog,
    search,
    rolePermissions: role.permissions,
  });

  const collapsed = folded ?? emptyModules;
  const isSearching = search.trim().length > 0;

  const setMany = (permissions: string[], checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const permission of permissions) {
        if (checked) next.add(permission);
        else next.delete(permission);
      }
      return next;
    });

  const toggleModule = (module: string) =>
    setFolded(() => {
      const next = new Set(collapsed);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });

  const visible = rows.flatMap((row) => row.permissions);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("assignTitle", { name: roleLabel })}
      onSubmit={() =>
        updatePermissions.mutate(
          { id: role.id, permissions: [...selected] },
          { onSuccess: onClose },
        )
      }
      submitDisabled={updatePermissions.isPending}
      // Ten action columns plus the function name and the "other" cell: the preset widths
      // squeeze the matrix, so it takes the screen (the modal still caps at 96vw).
      widthClassName="w-[1440px]"
    >
      <div className="flex min-h-0 flex-col gap-3">
        <div className="space-y-2.5">
          <p className="text-sm text-text-secondary">{t("assignHint")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              placeholder={t("searchPermission")}
              value={search}
              onChangeValue={setSearch}
            />
            <Button variant="secondary" onClick={() => setMany(visible, true)}>
              <Icon name="check" size={15} />
              {t("selectAll")}
            </Button>
            <Button variant="secondary" onClick={() => setMany(visible, false)}>
              <Icon name="circle-x" size={15} />
              {t("clearAll")}
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                setFolded(
                  collapsed.size > 0
                    ? new Set()
                    : new Set(blocks.map((block) => block.module)),
                )
              }
            >
              <Icon
                name={collapsed.size > 0 ? "chevron-down" : "chevron-up"}
                size={15}
              />
              {collapsed.size > 0 ? t("expandAll") : t("collapseAll")}
            </Button>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-light px-3 py-1 text-sm font-semibold text-brand">
              <Icon name="shield-check" size={14} />
              {t("selectedCount", { count: selected.size })}
            </span>
          </div>
        </div>

        {isLoading && <LoadingState />}

        {!isLoading && rows.length === 0 && (
          <EmptyState icon="shield-check" message={t("noPermissionFound")} />
        )}

        {!isLoading && rows.length > 0 && (
          <PermissionMatrix
            blocks={blocks}
            selected={selected}
            // A search shows what it matched; a fold made before it must not hide the hits,
            // so while one is running every module reads as open and cannot be folded.
            isModuleOpen={(module) => isSearching || !collapsed.has(module)}
            onToggleModule={isSearching ? undefined : toggleModule}
            onToggle={(permission) =>
              setMany([permission], !selected.has(permission))
            }
            onToggleMany={setMany}
          />
        )}
      </div>
    </Modal>
  );
}
