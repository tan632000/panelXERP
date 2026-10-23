"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { ChangePasswordModal } from "@/kernel/core/auth/components/ChangePasswordModal";
import { EditProfileModal } from "@/kernel/core/auth/components/EditProfileModal";
import { ProfileAvatar } from "@/kernel/core/auth/components/ProfileAvatar";
import { ProfileSignature } from "@/kernel/core/auth/components/ProfileSignature";
import { SignatureModal } from "@/kernel/core/auth/components/SignatureModal";
import { ResponsiveSidebar } from "@/kernel/core/components/layout/ResponsiveSidebar";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { LoadingState } from "@/kernel/core/components/ui/LoadingState";
import { PageHeader } from "@/kernel/core/components/ui/PageHeader";
import { useUserDepartments } from "@/kernel/core/hooks/useUserDepartments";
import { initials } from "@/kernel/core/lib/initials";
import { getLastVisitedPathname } from "@/kernel/core/lib/navigation-history";
import { toIntlLocale } from "@/kernel/i18n/locale";

/** Module whose namespace the sidebar falls back on; every section names its own anyway. */
const DEFAULT_MODULE_KEY = "sales";

/** The module the reader came from, so the sidebar opens on the section they left. */
function moduleKeyFromLastVisit(): string {
  const segment = getLastVisitedPathname()?.split("/").filter(Boolean)[0];
  return segment || DEFAULT_MODULE_KEY;
}

/** One labelled row of the account card. */
function InfoRow({
  icon,
  label,
  value,
  muted,
}: {
  icon: string;
  label: string;
  value: string;
  /** An unfilled field is still listed, but must not read like real data. */
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-text-tertiary">
        <Icon name={icon} size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          {label}
        </p>
        <p
          className={
            muted
              ? "mt-0.5 break-words text-sm text-text-tertiary"
              : "mt-0.5 break-words text-sm font-medium text-text-primary"
          }
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/** The one action a panel offers, sitting in its header so no screen repeats it. */
function PanelAction({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-none bg-transparent text-sm font-semibold text-brand hover:underline [font-family:inherit]"
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}

/** A titled panel — the shape every future System screen on this page will reuse. */
function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border-secondary bg-surface-primary">
      <header className="flex items-center justify-between gap-3 border-b border-border-tertiary px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
          <Icon name={icon} size={16} className="text-text-tertiary" />
          {title}
        </h2>
        {action}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function ProfilePage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const { user, isLoading } = useAuth();
  const { labelOf: departmentLabel } = useUserDepartments();
  // Read once on mount: the sidebar must not re-point itself while the reader is on the page.
  const [moduleKey] = useState(moduleKeyFromLastVisit);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);

  if (isLoading) return <LoadingState variant="fullscreen" />;
  // Signed out: the middleware is already redirecting, so render nothing over the top of it.
  if (!user) return null;

  const fallback = t("notProvided");
  // A role the seed no longer names still has to render as something; the code itself is the
  // most honest label left.
  const roleLabel = t.has(`roles.${user.role}`)
    ? t(`roles.${user.role}`)
    : user.role;
  const displayName = user.fullName || user.username;
  const lastLogin = user.lastLoginAt
    ? new Date(user.lastLoginAt).toLocaleString(toIntlLocale(locale))
    : fallback;

  return (
    <div className="isolate flex h-dvh w-full overflow-hidden bg-surface-tertiary text-base text-text-primary">
      <ResponsiveSidebar sidebar={{ moduleKey }}>
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface-tertiary">
          <PageHeader
            title={t("profileTitle")}
            description={t("profileDescription")}
          />
          <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-6 max-lg:px-3 max-lg:py-4">
            <div className="mx-auto max-w-5xl space-y-5">
              <section className="overflow-hidden rounded-xl border border-border-secondary bg-surface-primary">
                <div className="h-24 bg-gradient-to-r from-brand to-brand-hover" />
                <div className="flex items-end gap-4 px-5 pb-5">
                  <ProfileAvatar
                    avatarUrl={user.avatarUrl}
                    initials={initials(displayName)}
                  />
                  <div className="min-w-0 pb-1">
                    <h2 className="truncate text-xl font-bold text-text-primary">
                      {displayName}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-brand-light px-2.5 py-1 text-xs font-semibold text-brand">
                        {roleLabel}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2.5 py-1 text-xs font-semibold text-success-text">
                        <Icon name="circle-check" size={13} />
                        {t("accountActive")}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        @{user.username}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid items-start gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                  <Panel
                    title={t("accountSection")}
                    icon="user-circle"
                    action={
                      <PanelAction
                        icon="edit"
                        label={t("editProfile")}
                        onClick={() => setEditProfileOpen(true)}
                      />
                    }
                  >
                    <div className="grid gap-x-8 sm:grid-cols-2">
                      <InfoRow
                        icon="user"
                        label={t("fullName")}
                        value={user.fullName || fallback}
                        muted={!user.fullName}
                      />
                      <InfoRow
                        icon="inbox"
                        label={t("email")}
                        value={user.email}
                      />
                      <InfoRow
                        icon="phone"
                        label={t("phone")}
                        value={user.phone || fallback}
                        muted={!user.phone}
                      />
                      <InfoRow
                        icon="building"
                        label={t("department")}
                        value={departmentLabel(user.department) || fallback}
                        muted={!user.department}
                      />
                      <InfoRow
                        icon="tag"
                        label={t("jobTitle")}
                        value={user.title || fallback}
                        muted={!user.title}
                      />
                    </div>
                  </Panel>

                  <Panel
                    title={t("signature.title")}
                    icon="signature"
                    action={
                      <PanelAction
                        icon="signature"
                        label={t("signature.update")}
                        onClick={() => setSignatureOpen(true)}
                      />
                    }
                  >
                    <ProfileSignature
                      signatureUrl={user.signatureUrl}
                      pendingSignatureUrl={user.pendingSignatureUrl}
                      signatureRequestedAt={user.signatureRequestedAt}
                      signatureRejectionReason={user.signatureRejectionReason}
                      onAdd={() => setSignatureOpen(true)}
                    />
                  </Panel>
                </div>

                <Panel
                  title={t("securitySection")}
                  icon="shield-check"
                  action={
                    <PanelAction
                      icon="lock"
                      label={t("changePassword")}
                      onClick={() => setChangePasswordOpen(true)}
                    />
                  }
                >
                  <InfoRow
                    icon="clock"
                    label={t("lastLoginAt")}
                    value={lastLogin}
                    muted={!user.lastLoginAt}
                  />
                  <p className="mt-1 border-t border-border-tertiary pt-3 text-sm leading-6 text-text-secondary">
                    {t("changePasswordHint")}
                  </p>
                </Panel>
              </div>
            </div>
          </div>
        </main>
      </ResponsiveSidebar>

      {editProfileOpen && (
        <EditProfileModal isOpen onClose={() => setEditProfileOpen(false)} />
      )}

      {signatureOpen && (
        <SignatureModal onClose={() => setSignatureOpen(false)} />
      )}

      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </div>
  );
}
