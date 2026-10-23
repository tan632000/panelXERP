import { Inter } from "next/font/google";

import { CountryFlagPolyfill } from "@/kernel/core/components/ui/CountryFlagPolyfill";
import { resolveThemeFromEnv, themeToCssBlock } from "@/kernel/core/theme";

import type { Metadata } from "next";
import "./globals.css";

// Full Vietnamese subset: every precomposed tone mark comes from this one face
// instead of falling back glyph by glyph to a system font.
const appSans = Inter({
  variable: "--font-app-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const appName = process.env.NEXT_PUBLIC_APP_NAME || "ERP Platform";
const appDescription =
  process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
  "Manufacturing ERP — modular monolith";

export const metadata: Metadata = {
  title: appName,
  description: appDescription,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const themeCss = themeToCssBlock(resolveThemeFromEnv());

  return (
    <html lang="vi" className={`${appSans.variable} h-full`}>
      <head>
        <style id="erp-theme-vars">{themeCss}</style>
      </head>
      {/* suppressHydrationWarning: extensions (e.g. ColorZilla) add attributes
          like `cz-shortcut-listen` to <body> before React hydrates. It only
          suppresses this element's own attribute diffs, not its children. */}
      <body
        suppressHydrationWarning
        className={`${appSans.variable} min-h-full bg-surface-tertiary font-sans antialiased`}
      >
        <CountryFlagPolyfill />
        {children}
      </body>
    </html>
  );
}
