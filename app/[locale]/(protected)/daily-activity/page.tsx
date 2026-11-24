import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DailyActivityControls } from "@/components/daily-activity-controls";
import {
  type ActivityScopeMode,
  type ActivityTone,
  canAccessDailyActivity,
} from "@/features/daily-activity/calculations";
import { loadDailyActivity } from "@/features/daily-activity/service";
import { formatOmanDateTimeDisplay } from "@/features/ledger/calculations";
import { requireIdentity } from "@/lib/auth";
import { translateSafe } from "@/lib/i18n-helpers";

function toneBadgeClass(tone: ActivityTone): string {
  switch (tone) {
    case "emerald":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-200";
    case "sky":
      return "border-sky-500/30 bg-sky-500/15 text-sky-200";
    case "amber":
      return "border-amber-500/30 bg-amber-500/15 text-amber-200";
    case "red":
      return "border-red-500/30 bg-red-500/15 text-red-200";
    case "violet":
      return "border-violet-500/30 bg-violet-500/15 text-violet-200";
    default:
      return "border-[var(--edge)] bg-white/10 text-[var(--ink)]";
  }
}

export default async function DailyActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    branchId?: string;
    userId?: string;
    from?: string;
    to?: string;
    activityType?: string;
    page?: string;
  }>;
}) {
  const [actor, { locale }, query, tActivity, tCommon] = await Promise.all([
    requireIdentity(),
    params,
    searchParams,
    getTranslations("activity"),
    getTranslations("common"),
  ]);
  if (!canAccessDailyActivity(actor)) redirect(`/${locale}/forbidden`);

  const requestedPage = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const data = await loadDailyActivity(actor, locale, {
    q: query.q,
    branchId: query.branchId,
    userId: query.userId,
    from: query.from,
    to: query.to,
    activityType: query.activityType,
    page: requestedPage,
  });

  const scopeLabel = (scopeMode: ActivityScopeMode) => {
    switch (scopeMode) {
      case "ALL":
        return { title: tActivity("scopeAllTitle"), subtitle: tActivity("scopeAllSubtitle") };
      case "BRANCH_ADMIN":
        return { title: tActivity("scopeBranchTitle"), subtitle: tActivity("scopeBranchSubtitle") };
      case "SELF":
        return { title: tActivity("scopeSelfTitle"), subtitle: tActivity("scopeSelfSubtitle") };
    }
  };
  const scope = scopeLabel(data.scopeMode);
  const rangeStart = data.totalMatching ? (data.page - 1) * data.pageSize + 1 : 0;
  const rangeEnd = Math.min(data.totalMatching, data.page * data.pageSize);

  const pageHref = (page: number) => {
    const p = new URLSearchParams();
    if (data.filters.q) p.set("q", data.filters.q);
    if (data.filters.branchId) p.set("branchId", data.filters.branchId);
    if (data.filters.userId) p.set("userId", data.filters.userId);
    if (data.filters.from) p.set("from", data.filters.from);
    if (data.filters.to) p.set("to", data.filters.to);
    if (data.filters.activityType && data.filters.activityType !== "ALL") {
      p.set("activityType", data.filters.activityType);
    }
    if (page > 1) p.set("page", String(page));
    return `/${locale}/daily-activity${p.size ? `?${p.toString()}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--accent)]">{tActivity("eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold">{tActivity("title")}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{tActivity("subtitle")}</p>
        </div>
        <p className="text-xs text-[var(--muted)]">
          {data.totalMatching
            ? tActivity("matchingCount", {
                start: rangeStart,
                end: rangeEnd,
                total: data.totalMatching,
              })
            : tActivity("zeroMatching")}{" "}
          · {tCommon("pageOf", { page: data.page, total: data.totalPages })}
        </p>
      </div>

      {/* KPI Summary Strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--muted)]">{tActivity("matchingActivities")}</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{data.totalMatching}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {tCommon("perPage", { count: data.pageSize })} ·{" "}
            {tActivity("pagesCount", { count: data.totalPages })}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--muted)]">{tActivity("todayOman")}</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[var(--accent)]">
            {data.todayCount}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">{tActivity("todaySubtitle")}</p>
        </div>

        <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--muted)]">{tActivity("activeUsers")}</p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
            {data.distinctActors}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">{tActivity("activeUsersSubtitle")}</p>
        </div>

        <div className="rounded-xl border border-[var(--edge)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--muted)]">{tActivity("visibilityScope")}</p>
          <p className="mt-1 text-base font-semibold">{scope.title}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{scope.subtitle}</p>
        </div>
      </section>

      <DailyActivityControls
        scopeMode={data.scopeMode}
        allowedEvents={data.allowedEvents}
        branches={data.branches}
        users={data.users}
        initialFilters={data.filters}
      />

      {/* Chronological Activity Table */}
      <section className="space-y-4 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{tActivity("feedTitle")}</h2>
            <p className="text-xs text-[var(--muted)]">{tActivity("feedSubtitle")}</p>
          </div>
          <span className="text-xs text-[var(--muted)]">
            {tCommon("pageOf", { page: data.page, total: data.totalPages })}
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--edge)]">
          <table className="min-w-[58rem] w-full text-sm">
            <thead className="bg-[var(--raised)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-3 text-start">{tCommon("dateTimeOman")}</th>
                <th className="px-3 py-3 text-start">{tActivity("activityCol")}</th>
                <th className="px-3 py-3 text-start">{tActivity("actorCol")}</th>
                <th className="px-3 py-3 text-start">{tCommon("branch")}</th>
                <th className="px-3 py-3 text-start">{tActivity("entityDetailsCol")}</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-t border-[var(--edge)] align-top transition-colors hover:bg-white/5"
                >
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--muted)]">
                    {formatOmanDateTimeDisplay(entry.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneBadgeClass(entry.tone)}`}
                    >
                      {translateSafe(tActivity, `events.${entry.event}`, entry.label)}
                    </span>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      {translateSafe(
                        tActivity,
                        `categories.${entry.category}`,
                        entry.categoryLabel,
                      )}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <p className="font-medium">
                      {entry.actorName === "System / Guest"
                        ? tCommon("systemGuest")
                        : entry.actorName === "Former user"
                          ? tCommon("formerUser")
                          : entry.actorName}
                    </p>
                    {entry.actorUsername && (
                      <p className="font-mono text-xs text-[var(--muted)]">
                        @{entry.actorUsername}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {entry.branchName ? (
                      <>
                        <p className="text-sm">{entry.branchName}</p>
                        {entry.branchCode && (
                          <p className="font-mono text-xs text-[var(--muted)]">
                            {entry.branchCode}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">{tCommon("globalSystem")}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-[var(--edge)] bg-black/25 px-1.5 py-0.5 text-[11px] text-[var(--muted)]">
                        {translateSafe(
                          tActivity,
                          `entities.${entry.entityType}`,
                          entry.entityLabel,
                        )}
                      </span>
                      <span className="text-sm">{entry.summary}</span>
                      {entry.href && (
                        <Link
                          href={entry.href as never}
                          className="text-xs font-medium text-[var(--accent)] hover:underline"
                        >
                          {tActivity("openLink")}
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.entries.length && (
            <p className="p-8 text-sm text-[var(--muted)]">{tActivity("noEntries")}</p>
          )}
        </div>

        {data.totalPages > 1 && (
          <nav
            aria-label={tActivity("title")}
            className="flex flex-wrap items-center justify-between gap-3 text-sm"
          >
            <span className="text-xs text-[var(--muted)]">
              {tCommon("showingRange", {
                start: rangeStart,
                end: rangeEnd,
                total: data.totalMatching,
              })}
            </span>
            <div className="flex items-center gap-2">
              {data.page > 1 && (
                <Link
                  href={pageHref(data.page - 1) as never}
                  className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3 hover:border-[var(--accent)]"
                >
                  {tCommon("previous")}
                </Link>
              )}
              <span className="px-2 text-[var(--muted)]">
                {tCommon("pageOf", { page: data.page, total: data.totalPages })}
              </span>
              {data.page < data.totalPages && (
                <Link
                  href={pageHref(data.page + 1) as never}
                  className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3 hover:border-[var(--accent)]"
                >
                  {tCommon("next")}
                </Link>
              )}
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}
