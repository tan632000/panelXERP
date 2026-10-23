const appName = process.env.NEXT_PUBLIC_APP_NAME || "ERP Platform";

export const metadata = {
  title: `Profile — ${appName}`,
  description: "User account profile and security settings",
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
