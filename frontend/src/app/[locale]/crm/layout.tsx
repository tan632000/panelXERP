import { ModuleShell } from "@/kernel/core/components/layout/ModuleShell";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "ERP Platform";

export const metadata = {
  title: `CRM — ${appName}`,
  description: "Customer management workspace",
};

export default function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ModuleShell moduleKey="crm">{children}</ModuleShell>;
}
