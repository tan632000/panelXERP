import { ModuleShell } from "@/kernel/core/components/layout/ModuleShell";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "ERP Platform";

export const metadata = {
  title: `Inventory — ${appName}`,
  description: "Purchasing and warehouse workspace",
};

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ModuleShell moduleKey="inventory">{children}</ModuleShell>;
}
