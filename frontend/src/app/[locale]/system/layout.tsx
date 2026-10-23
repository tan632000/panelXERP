import { ModuleShell } from "@/kernel/core/components/layout/ModuleShell";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "ERP Platform";

export const metadata = {
  title: `System — ${appName}`,
  description: "System administration workspace",
};

export default function SystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ModuleShell moduleKey="system">{children}</ModuleShell>;
}
