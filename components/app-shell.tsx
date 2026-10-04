import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { can, getIdentity } from "@/lib/auth";
import { LogoutButton } from "./logout-button";
import { OperationalFilters } from "./operational-filters";
export async function AppShell({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: string;
}) {
  const identity = await getIdentity();
  const t = await getTranslations();
  const items = [
    { href: "/dashboard", label: t("dashboard"), module: "dashboard" },
    { href: "/fleet", label: "Fleet", module: "fleet" },
    { href: "/service", label: "Service", module: "fleet" },
    { href: "/expiry", label: "Expiry", module: "fleet" },
    { href: "/settings", label: "Settings", module: "settings" },
    { href: "/customers", label: "Customers", module: "customers" },
    { href: "/rentals", label: t("rentals"), module: "rentals" },
    { href: "/finance/advance", label: "Finance", module: "finance" },
    { href: "/transfers", label: "Transfer", module: "rentals" },
    { href: "/invoices", label: "Invoices", module: "finance" },
    { href: "/admin/branches", label: t("branches"), module: "branches" },
    { href: "/admin/users", label: t("users"), module: "users" },
  ].filter((x) => identity && can(identity, x.module, "read"));
  return (
    <div
      data-app-shell
      className="mx-auto min-h-screen min-w-0 max-w-7xl px-3 pb-24 sm:px-4 md:px-8 lg:pb-8"
    >
      <header className="flex min-h-16 min-w-0 items-center justify-between gap-2 border-b border-[var(--edge)] sm:min-h-20 sm:gap-4">
        <Link
          href={`/${locale}/dashboard`}
          className="shrink-0 text-sm font-semibold tracking-wide sm:text-base"
        >
          MUSCAT <span className="text-[var(--accent)]">CARS</span>
        </Link>
        <nav className="hidden min-w-0 items-center gap-3 overflow-x-auto whitespace-nowrap lg:flex xl:gap-4">
          {items.map((item) => (
            <Link
              key={item.href}
              href={`/${locale}${item.href}` as never}
              className="text-sm text-[var(--muted)] hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex min-w-0 items-center gap-1 sm:gap-3">
          <OperationalFilters />
          <Link
            href={`/${locale === "en" ? "ar" : "en"}/dashboard`}
            className="min-h-11 content-center px-1 text-xs sm:text-sm"
          >
            {t("language")}
          </Link>
          <LogoutButton />
        </div>
      </header>
      <main className="min-w-0 py-5 sm:py-8">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid min-h-[5rem] grid-flow-col auto-cols-[minmax(4rem,1fr)] overflow-x-auto items-center border-t border-[var(--edge)] bg-[#121211]/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {items.map((item) => (
          <Link
            key={item.href}
            href={`/${locale}${item.href}` as never}
            className="min-h-11 min-w-0 content-center truncate px-1 text-center text-[11px] text-[var(--muted)] sm:px-2 sm:text-xs"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
