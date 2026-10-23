"use client";

import React from "react";

import { BrandLogo } from "@/kernel/core/components/layout/BrandLogo";
import {
  Sidebar,
  type SidebarProps,
} from "@/kernel/core/components/layout/Sidebar";
import { appConfig } from "@/kernel/core/config/app.config";

export interface AppSidebarProps extends Pick<
  SidebarProps,
  "badges" | "brandLogo" | "brandName" | "footer" | "drawer" | "onClose"
> {
  moduleKey: string;
}

export function AppSidebar({
  moduleKey,
  brandLogo = <BrandLogo />,
  brandName = appConfig.name,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar
      brandLogo={brandLogo}
      brandName={brandName}
      moduleKey={moduleKey}
      {...props}
    />
  );
}
