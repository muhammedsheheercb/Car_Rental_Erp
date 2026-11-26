import { cookies } from "next/headers";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { canAccessDailyActivity } from "@/features/daily-activity/calculations";
import { getConciergeShellSummary } from "@/features/dashboard/shell-summary";
import { formatOMR } from "@/features/rentals/calculations";
import { can, getIdentity } from "@/lib/auth";
import { translateStatus } from "@/lib/i18n-helpers";
import { CollapsibleAppShell } from "./collapsible-shell";
import { ConciergeMobileNav, type ConciergeNavItem, ConciergeSidebarNav } from "./concierge-nav";

const SIDEBAR_COOKIE_NAME = "mc_sidebar_collapsed";

export async function AppShell({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: string;
}) {
  const [cookieStore, identity, t, tDash, tStatus] = await Promise.all([
    cookies(),
    getIdentity(),
    getTranslations("nav"),
    getTranslations("dashboard"),
    getTranslations("status"),
  ]);

  const initialCollapsed = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === "1";

  const summary = identity
    ? await getConciergeShellSummary(identity).catch(() => ({
        monthlyRevenueBaisa: 0,
        outstandingBaisa: 0,
        totalVehicles: 0,
        availableVehicles: 0,
        openRentals: 0,
        activeCustomers: 0,
        lateVehicles: 0,
        nearService: 0,
        expiringDocs: 0,
      }))
    : null;

  const totalAlerts = summary
    ? summary.lateVehicles + summary.nearService + summary.expiringDocs
    : 0;

  const rawItems: Array<ConciergeNavItem & { module: string; alsoRequires?: string }> = [
    { href: "/dashboard", label: t("overview"), module: "dashboard", group: "operations" },
    {
      href: "/daily-activity",
      label: t("activity"),
      module: "daily-activity",
      group: "operations",
    },
    {
      href: "/rentals",
      label: t("rentals"),
      module: "rentals",
      group: "operations",
      badge: summary?.openRentals,
    },
    { href: "/transfers", label: t("transfer"), module: "rentals", group: "operations" },
    {
      href: "/fleet",
      label: t("fleet"),
      module: "fleet",
      group: "fleet",
      badge: summary?.totalVehicles,
    },
    {
      href: "/service",
      label: t("service"),
      module: "fleet",
      group: "fleet",
      badge: summary?.nearService,
      badgeTone: "alert",
    },
    {
      href: "/expiry",
      label: t("expiry"),
      module: "fleet",
      group: "fleet",
      badge: summary?.expiringDocs,
      badgeTone: "alert",
    },
    { href: "/finance/advance", label: t("finance"), module: "finance", group: "finance" },
    { href: "/invoices", label: t("invoices"), module: "finance", group: "finance" },
    {
      href: "/ledger",
      label: t("ledger"),
      module: "finance",
      alsoRequires: "customers",
      group: "finance",
    },
    { href: "/reports", label: t("reports"), module: "reports", group: "finance" },
    {
      href: "/customers",
      label: t("customers"),
      module: "customers",
      group: "admin",
      badge: summary?.activeCustomers,
    },
    { href: "/admin/branches", label: t("branches"), module: "branches", group: "admin" },
    { href: "/admin/users", label: t("users"), module: "users", group: "admin" },
    { href: "/settings", label: t("settings"), module: "settings", group: "admin" },
  ];

  const items: ConciergeNavItem[] = rawItems
    .filter(
      (x) =>
        identity &&
        (x.module === "daily-activity"
          ? canAccessDailyActivity(identity)
          : can(identity, x.module, "read")) &&
        (!x.alsoRequires || can(identity, x.alsoRequires, "read")),
    )
    .map(({ module: _m, alsoRequires: _a, ...item }) => item);

  const groups = [
    { key: "operations", label: t("groupOperations") },
    { key: "fleet", label: t("groupFleet") },
    { key: "finance", label: t("groupFinance") },
    { key: "admin", label: t("groupAdmin") },
  ]
    .map((group) => ({
      ...group,
      items: items.filter((item) => item.group === group.key),
    }))
    .filter((group) => group.items.length > 0);

  const sidebarBody = (
    <>
      {/* Live Executive Summary Card */}
      {summary && (
        <div className="rounded-2xl border border-[#CFA968]/30 bg-gradient-to-br from-[#CFA968]/15 via-[#CFA968]/8 to-transparent p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#CFA968]">
            {tDash("monthlyRevenue")}
          </p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums text-[#FAF8F5]">
            {formatOMR(summary.monthlyRevenueBaisa)}
          </p>
          <div className="mt-3.5 space-y-1.5 border-t border-white/10 pt-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#A8A196]">{tDash("outstandingShort")}</span>
              <span className="font-semibold tabular-nums text-[#F6F3EC]">
                {formatOMR(summary.outstandingBaisa)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#A8A196]">{tDash("fleetAvailable")}</span>
              <span className="font-semibold tabular-nums text-[#6EE7B7]">
                {tDash("readyCount", {
                  available: summary.availableVehicles,
                  total: summary.totalVehicles,
                })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Categorized Navigation */}
      <ConciergeSidebarNav locale={locale} groups={groups} />

      {/* Attention Required Alert Card */}
      {summary && (
        <Link
          href={
            (summary.lateVehicles > 0
              ? `/${locale}/operations/late-car`
              : `/${locale}/expiry`) as never
          }
          className={`block rounded-2xl border p-3.5 text-xs transition-colors ${
            totalAlerts > 0
              ? "border-red-500/35 bg-red-600/12 text-red-200 hover:bg-red-600/20"
              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
          }`}
        >
          <p className="font-semibold">{tDash("attentionRequired")}</p>
          <p className="mt-1 leading-relaxed opacity-90">
            {totalAlerts > 0
              ? tDash("attentionSummary", {
                  late: summary.lateVehicles,
                  service: summary.nearService,
                  docs: summary.expiringDocs,
                })
              : tDash("allClearAlerts")}
          </p>
        </Link>
      )}
    </>
  );

  const sidebarIdentity = (
    <div className="min-w-0">
      <p className="truncate text-xs font-semibold text-[#F6F3EC]">{identity?.displayName}</p>
      {identity?.role && (
        <p className="truncate text-[11px] text-[#AEA79C]">
          {translateStatus(tStatus, identity.role)}
        </p>
      )}
    </div>
  );

  return (
    <CollapsibleAppShell
      initialCollapsed={initialCollapsed}
      locale={locale}
      sidebarBody={sidebarBody}
      sidebarIdentity={sidebarIdentity}
      mobileNav={<ConciergeMobileNav locale={locale} items={items} />}
    >
      {children}
    </CollapsibleAppShell>
  );
}
