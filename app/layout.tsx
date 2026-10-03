import "./globals.css";
import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/service-worker";
export const metadata: Metadata = {
  title: "MUSCAT CARS",
  description: "Oman car rental operations",
  manifest: "/manifest.webmanifest",
  applicationName: "MUSCAT CARS",
  appleWebApp: { capable: true, title: "MUSCAT CARS", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon-maskable.svg" },
};
export const viewport: Viewport = { themeColor: "#0b0b0a", colorScheme: "dark" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
