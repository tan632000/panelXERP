"use client";

import { useLocale, useTranslations } from "next-intl";
import React, { useEffect, useRef, useState, useTransition } from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { hasPermission } from "@/kernel/core/auth/tokens";
import { Icon } from "@/kernel/core/components/ui/Icon";
import { NotificationBell } from "@/kernel/core/components/ui/NotificationBell";
import { QrLinkScanButton } from "@/kernel/core/components/ui/QrLinkScanButton";
import { cn } from "@/kernel/core/lib/cn";
import { Link, usePathname, useRouter } from "@/kernel/i18n/navigation";

const AVATAR_COLORS = [
  { bg: "#dbeafe", text: "#1d4ed8" },
  { bg: "#dcfce7", text: "#15803d" },
  { bg: "#fef3c7", text: "#b45309" },
  { bg: "#fce7f3", text: "#be185d" },
  { bg: "#ede9fe", text: "#6d28d9" },
];

const LANGUAGE_OPTIONS = [
  { code: "en", labelKey: "english", flag: "🇺🇸" },
  { code: "vi", labelKey: "vietnamese", flag: "🇻🇳" },
] as const;

function getAvatarColors(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function PageHeaderUserMenu() {
  const t = useTranslations("common");
  const tSystem = useTranslations("system");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, permissions } = useAuth();
  // Administration lives here rather than in the sidebar: it is not a module of the
  // Function List, and only a full-access account ever reaches it. Read off the session's
  // own scopes, which every screen embedding this menu already carries.
  const canAdminister = hasPermission(permissions ?? [], "*:*");
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName = user?.fullName || user?.username || "User";
  const colors = getAvatarColors(displayName);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
        setLanguageOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const changeLocale = (nextLocale: "en" | "vi") => {
    if (nextLocale === locale || isPending) return;

    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
    setOpen(false);
    setLanguageOpen(false);
  };

  return (
    <div
      className="relative flex shrink-0 items-center gap-2.5 pt-0.5 max-lg:gap-1 max-lg:pt-0"
      ref={menuRef}
    >
      <QrLinkScanButton />
      <NotificationBell />

      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#b8e6df] bg-[#f0faf8] py-1 pl-1 pr-2.5 [font-family:inherit] hover:bg-[#e4f5f2] max-lg:pr-1"
        // The name is hidden on a phone, so the avatar alone has to say what it opens.
        aria-label={displayName}
        onClick={() => {
          setOpen((prev) => !prev);
          setLanguageOpen(false);
        }}
        aria-expanded={open}
      >
        <span
          className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold"
          style={
            user?.avatarUrl
              ? undefined
              : { background: colors.bg, color: colors.text }
          }
        >
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt={displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            getInitials(displayName)
          )}
        </span>
        <span className="max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold text-text-primary max-lg:hidden">
          {displayName}
        </span>
        <Icon
          name="chevron-down"
          size={14}
          className={cn(
            "transition-transform duration-150 max-lg:hidden",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[196px] rounded-lg border border-border-secondary bg-surface-primary py-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
          <Link
            href="/profile"
            className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3.5 py-2 text-left text-sm text-text-primary [font-family:inherit] hover:bg-surface-secondary"
            onClick={() => {
              setOpen(false);
              setLanguageOpen(false);
            }}
          >
            <Icon name="user" size={14} />
            {t("profile")}
          </Link>

          {canAdminister && (
            <>
              <Link
                href="/system/users"
                className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3.5 py-2 text-left text-sm text-text-primary [font-family:inherit] hover:bg-surface-secondary"
                onClick={() => {
                  setOpen(false);
                  setLanguageOpen(false);
                }}
              >
                <Icon name="users" size={14} />
                {tSystem("userManagement")}
              </Link>
              <Link
                href="/system/roles"
                className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3.5 py-2 text-left text-sm text-text-primary [font-family:inherit] hover:bg-surface-secondary"
                onClick={() => {
                  setOpen(false);
                  setLanguageOpen(false);
                }}
              >
                <Icon name="shield-check" size={14} />
                {tSystem("rolePermissions")}
              </Link>
              <div className="my-1 border-t border-border-tertiary" />
            </>
          )}

          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3.5 py-2 text-left text-sm text-text-primary [font-family:inherit] hover:bg-surface-secondary"
            onClick={() => {
              logout();
              setOpen(false);
              setLanguageOpen(false);
            }}
          >
            <Icon name="logout" size={14} />
            {t("logout")}
          </button>
          <button
            type="button"
            className={cn(
              "block w-full cursor-pointer border-none bg-transparent px-3.5 py-2 text-left text-sm text-text-primary [font-family:inherit] hover:bg-surface-secondary",
              "flex items-center justify-between gap-3",
              languageOpen && "bg-surface-secondary font-semibold",
            )}
            onClick={() => setLanguageOpen((prev) => !prev)}
            aria-expanded={languageOpen}
          >
            <span className="flex items-center gap-2">
              <Icon name="language" size={14} />
              {t("language")}
            </span>
            <Icon name="chevron-left" size={14} />
          </button>

          {languageOpen && (
            <div className="absolute bottom-0 right-[calc(100%+8px)] z-[51] min-w-[160px] rounded-lg border border-border-secondary bg-surface-primary py-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
              {LANGUAGE_OPTIONS.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-3.5 py-2 text-left text-sm text-text-primary [font-family:inherit] hover:bg-surface-secondary",
                    locale === option.code &&
                      "bg-surface-secondary font-semibold",
                  )}
                  onClick={() => changeLocale(option.code)}
                  disabled={isPending}
                >
                  <span
                    className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-full text-sm leading-none"
                    aria-hidden="true"
                  >
                    {option.flag}
                  </span>
                  <span>{t(option.labelKey)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
