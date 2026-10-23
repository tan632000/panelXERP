"use client";

import React from "react";

import { Icon } from "@/kernel/core/components/ui/Icon";

export interface EmptyStateProps {
  icon: string;
  message: React.ReactNode;
  iconSize?: number;
  bordered?: boolean;
}

export function EmptyState({
  icon,
  message,
  iconSize = 36,
  bordered = true,
}: Readonly<EmptyStateProps>) {
  const content = (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center text-text-secondary [&_svg]:mx-auto [&_svg]:mb-2.5 [&_svg]:block [&_svg]:opacity-40">
      <Icon name={icon} size={iconSize} />
      <p>{message}</p>
    </div>
  );

  if (!bordered) {
    return content;
  }

  return (
    <div className="overflow-hidden rounded-[9px] border border-border-secondary bg-surface-primary">
      {content}
    </div>
  );
}
