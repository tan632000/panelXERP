import { ModuleShell } from "@/kernel/core/components/layout/ModuleShell";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "ERP Platform";

export const metadata = {
  title: `Catalog — ${appName}`,
  description: "Item catalog workspace",
};

export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ModuleShell moduleKey="catalog">{children}</ModuleShell>;
}
