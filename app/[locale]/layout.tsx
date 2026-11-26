import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { LocaleSync } from "@/components/locale-sync";
import { ServiceWorker } from "@/components/service-worker";
import { ToastProvider } from "@/components/toast";
import { routing } from "@/i18n/routing";

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const messages = await getMessages({ locale });
  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <LocaleSync locale={locale} />
        <ToastProvider>{children}</ToastProvider>
        <ServiceWorker />
      </NextIntlClientProvider>
    </div>
  );
}
