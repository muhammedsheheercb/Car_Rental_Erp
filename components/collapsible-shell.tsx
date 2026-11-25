"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { LanguageSwitcher } from "./language-switcher";
import { LogoutButton } from "./logout-button";
import { OperationalFilters } from "./operational-filters";

const SIDEBAR_COOKIE_NAME = "mc_sidebar_collapsed";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function persistSidebarPreference(collapsed: boolean) {
  const value = collapsed ? "1" : "0";
  const maybeCookieStore = (
    window as unknown as {
      cookieStore?: {
        set: (opts: {
          name: string;
          value: string;
          path?: string;
          expires?: number;
          sameSite?: "lax" | "strict" | "none";
        }) => Promise<void>;
      };
    }
  ).cookieStore;

  if (maybeCookieStore?.set) {
    void maybeCookieStore
      .set({
        name: SIDEBAR_COOKIE_NAME,
        value,
        path: "/",
        expires: Date.now() + SIDEBAR_COOKIE_MAX_AGE * 1000,
        sameSite: "lax",
      })
      .catch(() => {
        // Fallback silently if the Cookie Store API rejects in restricted contexts.
      });
    return;
  }

  // biome-ignore lint/suspicious/noDocumentCookie: fallback for browsers without the Cookie Store API
  document.cookie = `${SIDEBAR_COOKIE_NAME}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 rtl:scale-x-[-1]"
    >
      <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
      <line x1="7.5" y1="3.5" x2="7.5" y2="16.5" />
      {collapsed ? <path d="M11.2 8L13.5 10L11.2 12" /> : <path d="M13.5 8L11.2 10L13.5 12" />}
    </svg>
  );
}

export function CollapsibleAppShell({
  initialCollapsed,
  locale,
  sidebarBody,
  sidebarIdentity,
  mobileHeader,
  mobileNav,
  children,
}: {
  initialCollapsed: boolean;
  locale: string;
  sidebarBody: ReactNode;
  sidebarIdentity: ReactNode;
  mobileHeader: ReactNode;
  mobileNav: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("nav");
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function setSidebarCollapsed(next: boolean) {
    setCollapsed(next);
    persistSidebarPreference(next);
  }

  return (
    <div
      data-app-shell
      data-sidebar-collapsed={collapsed ? "true" : "false"}
      className="min-h-screen min-w-0 bg-[var(--canvas)] text-[var(--ink)] lg:flex"
    >
      {/* Desktop Split Obsidian & Gold Concierge Rail (collapsible) */}
      {!collapsed && (
        <aside
          id="concierge-sidebar"
          data-app-ui
          data-concierge-rail
          data-dark-surface
          className="hidden shrink-0 border-e border-white/10 bg-gradient-to-b from-[#0D0C0B] via-[#100F0D] to-[#141210] text-[#F6F3EC] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[280px] lg:flex-col xl:w-[292px] print:hidden"
        >
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 xl:px-5 xl:py-6">
            {/* Brand Crest, Language Pill & Collapse Button */}
            <div className="flex items-center justify-between gap-2">
              <Link
                href={`/${locale}/dashboard` as never}
                className="shrink-0 text-[14px] font-bold tracking-[0.16em] text-[#F6F3EC] xl:text-[15px] xl:tracking-[0.2em]"
              >
                MUSCAT <span className="text-[#CFA968]">CARS</span>
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                <LanguageSwitcher className="rounded-full border border-[#CFA968]/40 px-2.5 py-1 text-[11px] font-medium text-[#CFA968] transition-colors hover:bg-[#CFA968]/15" />
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(true)}
                  aria-expanded="true"
                  aria-controls="concierge-sidebar"
                  aria-label={t("hideSidebar")}
                  title={t("hideSidebar")}
                  className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-[#D7D1C7] transition-colors hover:border-[#CFA968]/50 hover:bg-[#CFA968]/15 hover:text-[#CFA968]"
                >
                  <SidebarToggleIcon collapsed={false} />
                </button>
              </div>
            </div>

            {sidebarBody}
          </div>

          {/* Bottom Identity & Quick Controls */}
          <div className="border-t border-white/10 px-4 py-3.5 xl:px-5">
            <div className="flex items-center justify-between gap-2">
              {sidebarIdentity}
              <div className="flex shrink-0 items-center gap-1">
                <OperationalFilters direction="up" />
                <LogoutButton />
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Right Column: Mobile Header, Collapsed Desktop Top Bar, and Warm Ivory Canvas */}
      <div className="flex min-w-0 flex-1 flex-col">
        {mobileHeader}

        {/* Slim Warm Ivory Desktop Bar — shown ONLY when left sidebar is hidden */}
        {collapsed && (
          <header
            data-app-ui
            data-collapsed-topbar
            className="sticky top-0 z-20 hidden h-14 items-center justify-between gap-4 border-b border-[#E5E0D6] bg-[#F4F1EA]/95 px-6 backdrop-blur lg:flex lg:px-10 print:hidden"
          >
            <div className="flex min-w-0 items-center gap-3.5">
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                aria-expanded="false"
                aria-controls="concierge-sidebar"
                aria-label={t("showSidebar")}
                title={t("showSidebar")}
                className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-[#E5E0D6] bg-white px-3.5 text-xs font-semibold text-[#161513] shadow-[0_1px_2px_rgba(22,21,19,0.04)] transition-colors hover:border-[#CFA968] hover:text-[#8A6830]"
              >
                <SidebarToggleIcon collapsed={true} />
                <span>{t("menu")}</span>
              </button>
              <span aria-hidden="true" className="h-4 w-px bg-[#DDD7CC]" />
              <Link
                href={`/${locale}/dashboard` as never}
                className="shrink-0 text-[13px] font-bold tracking-[0.18em] text-[#161513]"
              >
                MUSCAT <span className="text-[#8A6830]">CARS</span>
              </Link>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <OperationalFilters direction="down" />
              <LanguageSwitcher className="inline-flex h-9 items-center rounded-full border border-[#E5E0D6] bg-white px-3 text-xs font-semibold text-[#161513] transition-colors hover:border-[#CFA968] hover:text-[#8A6830]" />
              <LogoutButton />
            </div>
          </header>
        )}

        {/* Warm Ivory Gallery Main Canvas */}
        <main
          data-ivory-canvas
          className={`min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 md:px-8 lg:px-10 lg:pb-10 ${
            collapsed ? "lg:pt-6" : "lg:pt-8"
          }`}
        >
          <div className={`mx-auto min-w-0 ${collapsed ? "max-w-[1440px]" : "max-w-[1380px]"}`}>
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      {mobileNav}
    </div>
  );
}
