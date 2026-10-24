import { ModuleShell } from "@/kernel/core/components/layout/ModuleShell";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "ERP Platform";

export const metadata = {
  title: `Sales — ${appName}`,
  description: "Sales workspace",
};

export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ModuleShell moduleKey="sales">{children}</ModuleShell>;
}
