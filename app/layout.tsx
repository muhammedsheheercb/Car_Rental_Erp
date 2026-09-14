import "./globals.css";
import type { Metadata } from "next";
import { ServiceWorker } from "@/components/service-worker";
export const metadata: Metadata = {
  title: "MUSCAT CARS",
  description: "Oman car rental operations",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MUSCAT CARS" },
};
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
