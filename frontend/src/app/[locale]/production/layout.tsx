import { ModuleShell } from "@/kernel/core/components/layout/ModuleShell";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "ERP Platform";

export const metadata = {
  title: `Production — ${appName}`,
  description: "Production orders and workshop progress",
};

export default function ProductionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ModuleShell moduleKey="production">{children}</ModuleShell>;
}
