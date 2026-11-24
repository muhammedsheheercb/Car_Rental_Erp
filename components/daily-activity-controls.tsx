"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { OmanDateTimePicker } from "@/components/oman-datetime-picker";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_EVENT_META,
  type ActivityCategory,
  type ActivityEvent,
  type ActivityScopeMode,
} from "@/features/daily-activity/calculations";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";

type BranchOption = { id: string; name: string; code: string };
type UserOption = { id: string; displayName: string; username: string };

export function DailyActivityControls({
  scopeMode,
  allowedEvents,
  branches,
  users,
  initialFilters,
}: {
  scopeMode: ActivityScopeMode;
  allowedEvents: ActivityEvent[];
  branches: BranchOption[];
  users: UserOption[];
  initialFilters: {
    q: string;
    branchId: string;
    userId: string;
    from: string;
    to: string;
    activityType: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const [q, setQ] = useState(initialFilters.q);
  const [branchId, setBranchId] = useState(initialFilters.branchId);
  const [userId, setUserId] = useState(initialFilters.userId);
  const [from, setFrom] = useState(initialFilters.from);
  const [to, setTo] = useState(initialFilters.to);
  const [activityType, setActivityType] = useState(initialFilters.activityType);

  useEffect(() => {
    setQ(initialFilters.q);
    setBranchId(initialFilters.branchId);
    setUserId(initialFilters.userId);
    setFrom(initialFilters.from);
    setTo(initialFilters.to);
    setActivityType(initialFilters.activityType);
  }, [
    initialFilters.q,
    initialFilters.branchId,
    initialFilters.userId,
    initialFilters.from,
    initialFilters.to,
    initialFilters.activityType,
  ]);

  const availableCategories = useMemo(() => {
    const allowedCats = new Set(allowedEvents.map((e) => ACTIVITY_EVENT_META[e].category));
    return ACTIVITY_CATEGORIES.filter(
      (cat): cat is Exclude<ActivityCategory, "ALL"> => cat !== "ALL" && allowedCats.has(cat),
    );
  }, [allowedEvents]);

  const navigateWith = (nextState: {
    q: string;
    branchId: string;
    userId: string;
    from: string;
    to: string;
    activityType: string;
  }) => {
    const params = new URLSearchParams();
    const trimmedQ = nextState.q.trim();
    if (trimmedQ) params.set("q", trimmedQ);
    if (nextState.branchId) params.set("branchId", nextState.branchId);
    if (scopeMode !== "SELF" && nextState.userId) params.set("userId", nextState.userId);
    if (nextState.from) params.set("from", nextState.from);
    if (nextState.to) params.set("to", nextState.to);
    if (nextState.activityType && nextState.activityType !== "ALL") {
      params.set("activityType", nextState.activityType);
    }
    startTransition(() => {
      router.push(`${pathname}${params.size ? `?${params.toString()}` : ""}` as never);
    });
  };

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    navigateWith({ q, branchId, userId, from, to, activityType });
  };

  const clearAll = () => {
    setQ("");
    setBranchId("");
    setUserId("");
    setFrom("");
    setTo("");
    setActivityType("ALL");
    startTransition(() => {
      router.push(pathname as never);
    });
  };

  const applyDatePreset = (preset: "today" | "7d" | "month" | "all") => {
    if (preset === "all") {
      setFrom("");
      setTo("");
      navigateWith({ q, branchId, userId, from: "", to: "", activityType });
      return;
    }
    const now = new Date();
    const todayStr = formatOmanDateTime(now).slice(0, 10);
    let nextFrom = `${todayStr}T00:00`;
    const nextTo = `${todayStr}T23:59`;
    if (preset === "7d") {
      const start = new Date(now.getTime() - 6 * 86_400_000);
      nextFrom = `${formatOmanDateTime(start).slice(0, 10)}T00:00`;
    } else if (preset === "month") {
      nextFrom = `${todayStr.slice(0, 7)}-01T00:00`;
    }
    setFrom(nextFrom);
    setTo(nextTo);
    navigateWith({ q, branchId, userId, from: nextFrom, to: nextTo, activityType });
  };

  const hasFilters = Boolean(
    initialFilters.q ||
      initialFilters.branchId ||
      initialFilters.userId ||
      initialFilters.from ||
      initialFilters.to ||
      initialFilters.activityType !== "ALL",
  );

  return (
    <form
      onSubmit={apply}
      aria-busy={pending}
      className="space-y-4 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-4 sm:p-5"
    >
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="grid min-w-0 gap-1 text-sm">
          <span>Keyword search</span>
          <input
            type="search"
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Agreement, vehicle, customer, receipt, user…"
            aria-label="Search daily activity"
            className="min-h-11 min-w-0 w-full border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          />
        </label>

        <label className="grid min-w-0 gap-1 text-sm">
          <span>Branch</span>
          <select
            name="branchId"
            aria-label="Filter by branch"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="min-h-11 min-w-0 w-full border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          >
            <option value="">
              {scopeMode === "ALL" ? "All branches" : "All permitted branches"}
            </option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name} · {branch.code}
              </option>
            ))}
          </select>
        </label>

        <div className="grid min-w-0 gap-1 text-sm">
          <label htmlFor="activityUser">User</label>
          {scopeMode === "SELF" ? (
            <select
              id="activityUser"
              name="userId"
              aria-label="Filter by user"
              value={users[0]?.id ?? ""}
              disabled
              className="min-h-11 min-w-0 w-full border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--muted)] opacity-80"
            >
              <option value={users[0]?.id ?? ""}>
                {users[0] ? `${users[0].displayName} (Own activity)` : "Own activity"}
              </option>
            </select>
          ) : (
            <select
              id="activityUser"
              name="userId"
              aria-label="Filter by user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="min-h-11 min-w-0 w-full border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
            >
              <option value="">{scopeMode === "ALL" ? "All users" : "All permitted users"}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} (@{user.username})
                </option>
              ))}
            </select>
          )}
        </div>

        <label className="grid min-w-0 gap-1 text-sm">
          <span>Activity type</span>
          <select
            name="activityType"
            aria-label="Filter by activity type"
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
            className="min-h-11 min-w-0 w-full border border-[var(--edge)] bg-[var(--raised)] px-3 text-sm text-[var(--ink)]"
          >
            <option value="ALL">All activity types</option>
            {availableCategories.length > 0 && (
              <optgroup label="By category">
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {ACTIVITY_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </optgroup>
            )}
            {allowedEvents.length > 0 && (
              <optgroup label="By specific action">
                {allowedEvents.map((ev) => (
                  <option key={ev} value={ev}>
                    {ACTIVITY_EVENT_META[ev].label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <OmanDateTimePicker
          id="activityFrom"
          name="from"
          label="From Date & Time (Oman)"
          value={from}
          onChange={setFrom}
        />

        <OmanDateTimePicker
          id="activityTo"
          name="to"
          label="To Date & Time (Oman)"
          value={to}
          onChange={setTo}
          min={from || undefined}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 flex-1 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-black disabled:opacity-60 sm:flex-none"
          >
            {pending ? "Filtering…" : "Apply Filters"}
          </button>
          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              disabled={pending}
              className="min-h-11 rounded-lg border border-[var(--edge)] px-4 text-sm text-[var(--muted)] hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--edge)] pt-3 text-xs">
        <span className="text-[var(--muted)]">Quick range (Oman):</span>
        <button
          type="button"
          onClick={() => applyDatePreset("today")}
          className="min-h-9 rounded-lg border border-[var(--edge)] px-3 text-[var(--muted)] hover:border-[var(--accent)] hover:text-white"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => applyDatePreset("7d")}
          className="min-h-9 rounded-lg border border-[var(--edge)] px-3 text-[var(--muted)] hover:border-[var(--accent)] hover:text-white"
        >
          Last 7 Days
        </button>
        <button
          type="button"
          onClick={() => applyDatePreset("month")}
          className="min-h-9 rounded-lg border border-[var(--edge)] px-3 text-[var(--muted)] hover:border-[var(--accent)] hover:text-white"
        >
          This Month
        </button>
        {(from || to) && (
          <button
            type="button"
            onClick={() => applyDatePreset("all")}
            className="min-h-9 rounded-lg border border-[var(--edge)] px-3 text-[var(--muted)] hover:border-[var(--accent)] hover:text-white"
          >
            All Time
          </button>
        )}
      </div>
    </form>
  );
}
