"use client";

import React from "react";

import { MobileNavButton } from "@/kernel/core/components/layout/MobileNavButton";
import { PageHeaderUserMenu } from "@/kernel/core/components/ui/PageHeaderUserMenu";
import { Tabs, type Tab } from "@/kernel/core/components/ui/Tabs";

export interface PageHeaderProps {
  title: string;
  /** Optional subtitle; screens whose mock shows none leave it out. */
  description?: string;
  tabs?: Tab[];
  activeKey?: string;
  onTabChange?: (key: string) => void;
}

export function PageHeader({
  title,
  description,
  tabs,
  activeKey,
  onTabChange,
}: PageHeaderProps) {
  return (
    <>
      <div className="flex shrink-0 items-start justify-between gap-2.5 border-b border-border-secondary bg-surface-primary px-5 py-[13px] lg:box-border lg:min-h-[length:var(--app-header-height)] max-lg:items-center max-lg:gap-1.5 max-lg:py-2 max-lg:pl-1.5 max-lg:pr-3">
        <MobileNavButton />
        {/* `min-w-0 flex-1` on a phone only: the title must give way to the menu before it
            pushes the account button off the screen. */}
        <div className="max-lg:min-w-0 max-lg:flex-1">
          <div className="mb-0.5 text-2xl font-bold text-text-primary max-lg:mb-0 max-lg:truncate max-lg:text-xl">
            {title}
          </div>
          {description && (
            <div className="text-sm text-text-secondary max-lg:truncate max-lg:text-[13px]">
              {description}
            </div>
          )}
        </div>
        <PageHeaderUserMenu />
      </div>
      {tabs && tabs.length > 0 && (
        <div className="shrink-0 border-b border-border-secondary bg-surface-tertiary px-5 max-lg:px-3">
          <Tabs items={tabs} activeKey={activeKey} onChange={onTabChange} />
        </div>
      )}
    </>
  );
}
