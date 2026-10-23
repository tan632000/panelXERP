import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";

import { QueryProvider } from "@/kernel/core/api/QueryProvider";
import { AuthProvider } from "@/kernel/core/auth/AuthContext";
import { Toaster } from "@/kernel/core/components/ui/Toaster";
import { NotificationProvider } from "@/kernel/core/contexts/NotificationContext";
import { resolveThemeFromEnv } from "@/kernel/core/theme/theme.config";
import { ThemeProvider } from "@/kernel/core/theme/ThemeProvider";

interface Props {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props) {
  const appName = process.env.NEXT_PUBLIC_APP_NAME?.trim();
  if (appName) {
    return { title: appName };
  }

  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });

  return {
    title: t("title"),
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  const messages = await getMessages();
  const theme = resolveThemeFromEnv();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ThemeProvider theme={theme}>
        <NotificationProvider>
          <QueryProvider>
            <AuthProvider>{children}</AuthProvider>
          </QueryProvider>
          <Toaster />
        </NotificationProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
