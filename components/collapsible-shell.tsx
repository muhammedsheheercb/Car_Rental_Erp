"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
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

function HamburgerIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      className="h-5 w-5"
    >
      <line x1="3.5" y1="5.5" x2="16.5" y2="5.5" />
      <line x1="3.5" y1="10" x2="16.5" y2="10" />
      <line x1="3.5" y1="14.5" x2="16.5" y2="14.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      className="h-4 w-4"
    >
      <line x1="5" y1="5" x2="15" y2="15" />
      <line x1="15" y1="5" x2="5" y2="15" />
    </svg>
  );
}

export function CollapsibleAppShell({
  initialCollapsed,
  locale,
  sidebarBody,
  sidebarIdentity,
  mobileNav,
  children,
}: {
  initialCollapsed: boolean;
  locale: string;
  sidebarBody: ReactNode;
  sidebarIdentity: ReactNode;
  mobileNav: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile/tablet drawer automatically after navigating to another route.
  useEffect(() => {
    void pathname;
    setMobileOpen(false);
  }, [pathname]);

  // Support Escape key and prevent background scroll while the mobile/tablet drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

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

      {/* Mobile & Tablet Slide-Out Obsidian Sidebar Drawer (< 1024px) */}
      {mobileOpen && (
        <div
          data-app-ui
          className="fixed inset-0 z-50 flex lg:hidden print:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t("menu")}
        >
          <aside
            id="mobile-concierge-drawer"
            data-concierge-rail
            data-dark-surface
            className="relative z-10 flex h-dvh w-[min(86vw,310px)] flex-col border-e border-white/10 bg-gradient-to-b from-[#0D0C0B] via-[#100F0D] to-[#141210] text-[#F6F3EC] shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-4">
              <Link
                href={`/${locale}/dashboard` as never}
                onClick={() => setMobileOpen(false)}
                className="shrink-0 text-sm font-bold tracking-[0.18em] text-[#F6F3EC]"
              >
                MUSCAT <span className="text-[#CFA968]">CARS</span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label={t("hideSidebar")}
                title={t("hideSidebar")}
                className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.05] text-[#D7D1C7] transition-colors hover:border-[#CFA968]/50 hover:bg-[#CFA968]/15 hover:text-[#CFA968]"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
              {sidebarBody}
            </div>

            <div className="border-t border-white/10 px-4 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
              <div className="flex items-center justify-between gap-2">
                {sidebarIdentity}
                <LanguageSwitcher className="shrink-0 rounded-full border border-[#CFA968]/40 px-2.5 py-1 text-xs font-medium text-[#CFA968] transition-colors hover:bg-[#CFA968]/15" />
              </div>
            </div>
          </aside>

          <button
            type="button"
            tabIndex={-1}
            aria-label={t("hideSidebar")}
            onClick={() => setMobileOpen(false)}
            className="flex-1 bg-black/65 backdrop-blur-[2px]"
          />
        </div>
      )}

      {/* Right Column: Mobile/Tablet Header, Collapsed Desktop Top Bar, and Warm Ivory Canvas */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile & Tablet Obsidian Header (< 1024px) */}
        <header
          data-app-ui
          data-dark-surface
          className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-2 border-b border-white/10 bg-[#0D0C0B]/95 px-3 text-[#F6F3EC] backdrop-blur sm:px-4 lg:hidden print:hidden"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-concierge-drawer"
              aria-label={t("showSidebar")}
              title={t("showSidebar")}
              className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/[0.05] text-[#F6F3EC] transition-colors hover:border-[#CFA968]/60 hover:bg-[#CFA968]/15 hover:text-[#CFA968]"
            >
              <HamburgerIcon />
            </button>
            <Link
              href={`/${locale}/dashboard` as never}
              className="truncate text-xs font-bold tracking-[0.14em] text-[#F6F3EC] sm:text-sm sm:tracking-[0.18em]"
            >
              MUSCAT <span className="text-[#CFA968]">CARS</span>
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <OperationalFilters direction="down" />
            <LanguageSwitcher className="rounded-full border border-[#CFA968]/40 px-2.5 py-1 text-xs font-medium text-[#CFA968] transition-colors hover:bg-[#CFA968]/15" />
            <LogoutButton />
          </div>
        </header>

        {/* Slim Warm Ivory Desktop Bar — shown ONLY when desktop left sidebar is hidden */}
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
