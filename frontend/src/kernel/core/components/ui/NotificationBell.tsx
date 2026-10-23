"use client";

import { useTranslations } from "next-intl";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/kernel/core/auth/AuthContext";
import { Icon } from "@/kernel/core/components/ui/Icon";
import {
  canReadAnyNotification,
  flattenNotificationPages,
  formatUnreadBadge,
  isNotificationUnread,
  resolveNotificationMessage,
  sortNotificationsNewestFirst,
  toNotificationTimeParts,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationList,
  useNotificationUnreadCount,
} from "@/kernel/core/hooks/api/useNotifications";
import { cn } from "@/kernel/core/lib/cn";
import { useRouter } from "@/kernel/i18n/navigation";

import type { NotificationItem } from "@/kernel/core/hooks/api/useNotifications";

/** Distance from the bottom of the panel at which the next page starts loading. */
const LOAD_MORE_THRESHOLD_PX = 48;

function NotificationRowMessage({ item }: { item: NotificationItem }) {
  const t = useTranslations("common.notification");
  const message = resolveNotificationMessage(item);

  return (
    <span className="min-w-0 flex-1 break-words text-sm text-text-primary">
      {message.kind === "text" ? message.text : t(message.key, message.values)}
      {message.kind === "key"
        ? message.lines?.map((line, index) => (
            <span key={index} className="mt-0.5 block text-text-secondary">
              {t(line.key, line.values)}
            </span>
          ))
        : null}
    </span>
  );
}

function NotificationRowTime({ createdAt }: { createdAt: string }) {
  const t = useTranslations("common.notification");
  const parts = toNotificationTimeParts(createdAt);
  return (
    <span className="shrink-0 text-[11px] text-text-tertiary">
      {t(parts.unit, { count: parts.count })}
    </span>
  );
}

export function NotificationBell() {
  const t = useTranslations("common.notification");
  const { permissions } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const canSeeBell = canReadAnyNotification(permissions);

  const unreadCountQuery = useNotificationUnreadCount(canSeeBell);
  const listQuery = useNotificationList(canSeeBell && open);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = useMemo(
    () =>
      sortNotificationsNewestFirst(flattenNotificationPages(listQuery.data)),
    [listQuery.data],
  );
  const badge = formatUnreadBadge(unreadCountQuery.data ?? 0);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = listQuery;

  /**
   * The panel loads the next page once the scroll reaches the last rows, so the user only
   * ever pays for what they scrolled to.
   */
  const handleListScroll = useCallback(
    (event: React.UIEvent<HTMLUListElement>) => {
      if (!hasNextPage || isFetchingNextPage) return;

      const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
      if (scrollHeight - scrollTop - clientHeight <= LOAD_MORE_THRESHOLD_PX) {
        void fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  if (!canSeeBell) return null;

  const handleRowActivate = (item: NotificationItem) => {
    if (!item.isRead) markRead.mutate(item.id);
    setOpen(false);
    if (item.link) router.push(item.link);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        className="relative inline-flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-text-primary hover:bg-surface-secondary"
        title={t("title")}
        aria-label={t("title")}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Icon name="bell" size={18} />
        {badge ? (
          <span
            data-testid="notification-badge"
            className="absolute right-0.5 top-0.5 min-w-[15px] rounded-full bg-red-500 px-1 text-center text-xs font-bold leading-[15px] text-white"
          >
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[320px] overflow-hidden rounded-lg border border-border-secondary bg-surface-primary shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
          <div className="flex items-center justify-between gap-2 border-b border-border-secondary px-3.5 py-2.5">
            <span className="text-sm font-bold text-text-primary">
              {t("title")}
            </span>
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent text-xs font-semibold text-brand [font-family:inherit] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => markAllRead.mutate()}
              disabled={items.length === 0 || markAllRead.isPending}
            >
              {t("markAllRead")}
            </button>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 px-3.5 py-8 text-text-tertiary">
              <Icon name="bell" size={24} />
              <span className="text-xs">{t("empty")}</span>
            </div>
          ) : (
            <ul
              className="scrollbar-thin max-h-[360px] overflow-y-auto"
              onScroll={handleListScroll}
            >
              {items.map((item) => {
                const unread = isNotificationUnread(item);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-2 border-none border-b border-border-secondary/70 bg-transparent px-3.5 py-2.5 text-left [font-family:inherit] hover:bg-surface-secondary",
                        unread && "bg-surface-secondary/60",
                      )}
                      onClick={() => handleRowActivate(item)}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          unread ? "bg-red-500" : "bg-transparent",
                        )}
                      />
                      <NotificationRowMessage item={item} />
                      <NotificationRowTime createdAt={item.createdAt} />
                    </button>
                  </li>
                );
              })}
              {isFetchingNextPage ? (
                <li
                  data-testid="notification-loading-more"
                  className="px-3.5 py-2.5 text-center text-xs text-text-tertiary"
                >
                  {t("loadingMore")}
                </li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
