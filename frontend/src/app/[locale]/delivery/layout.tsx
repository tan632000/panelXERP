import { ModuleShell } from "@/kernel/core/components/layout/ModuleShell";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "ERP Platform";

export const metadata = {
  title: `Delivery — ${appName}`,
  description: "Quality check and delivery",
};

export default function DeliveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ModuleShell moduleKey="delivery">{children}</ModuleShell>;
}
