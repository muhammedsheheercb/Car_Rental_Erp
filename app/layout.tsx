import "./globals.css";
import type { Metadata, Viewport } from "next";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = {
  title: "MUSCAT CARS",
  description: "Oman car rental operations",
  manifest: "/manifest.webmanifest",
  applicationName: "MUSCAT CARS",
  appleWebApp: { capable: true, title: "MUSCAT CARS", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon-maskable.svg" },
};
export const viewport: Viewport = { themeColor: "#0b0b0a", colorScheme: "dark" };
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  let locale = "en";
  try {
    locale = (await getLocale()) === "ar" ? "ar" : "en";
  } catch {
    locale = "en";
  }
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
