"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ConciergeNavItem = {
  href: string;
  label: string;
  group: "operations" | "fleet" | "finance" | "admin";
  badge?: number | string;
  badgeTone?: "default" | "gold" | "alert";
};

function isItemActive(pathname: string, locale: string, href: string) {
  const full = `/${locale}${href}`;
  if (href === "/dashboard") return pathname === full || pathname === `/${locale}`;
  if (href === "/finance/advance") return pathname.startsWith(`/${locale}/finance`);
  return pathname === full || pathname.startsWith(`${full}/`);
}

export function ConciergeSidebarNav({
  locale,
  groups,
}: {
  locale: string;
  groups: { key: string; label: string; items: ConciergeNavItem[] }[];
}) {
  const pathname = usePathname();
  return (
    <nav className="space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9E978B]">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = isItemActive(pathname, locale, item.href);
              return (
                <Link
                  key={item.href}
                  href={`/${locale}${item.href}` as never}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 items-center justify-between gap-2 rounded-xl px-3 py-2 text-[13px] transition-colors ${
                    active
                      ? "bg-white/[0.1] font-semibold text-[#FAF8F5]"
                      : "text-[#C4BEB3] hover:bg-white/[0.05] hover:text-[#FAF8F5]"
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {item.badge !== undefined && item.badge !== 0 && (
                      <span
                        className={`font-mono text-[11px] tabular-nums ${
                          item.badgeTone === "alert"
                            ? "font-semibold text-[#FDE68A]"
                            : item.badgeTone === "gold"
                              ? "font-semibold text-[#CFA968]"
                              : "text-[#A8A196]"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                    {active && (
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full bg-[#CFA968] shadow-[0_0_8px_rgba(207,169,104,0.7)]"
                      />
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function ConciergeMobileNav({
  locale,
  items,
}: {
  locale: string;
  items: ConciergeNavItem[];
}) {
  const pathname = usePathname();
  return (
    <nav
      data-app-ui
      data-dark-surface
      className="fixed inset-x-0 bottom-0 z-30 grid min-h-[4.75rem] grid-flow-col auto-cols-[minmax(4.25rem,1fr)] items-center overflow-x-auto border-t border-white/10 bg-[#0F0E0C]/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
    >
      {items.map((item) => {
        const active = isItemActive(pathname, locale, item.href);
        return (
          <Link
            key={item.href}
            href={`/${locale}${item.href}` as never}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-11 min-w-0 flex-col items-center justify-center truncate px-1.5 text-center text-[11px] sm:px-2 sm:text-xs ${
              active ? "font-semibold text-[#CFA968]" : "text-[#9C968B] hover:text-[#F6F3EC]"
            }`}
          >
            {active && (
              <span aria-hidden="true" className="mb-1 h-1 w-4 rounded-full bg-[#CFA968]" />
            )}
            <span className="max-w-full truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
