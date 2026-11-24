import "server-only";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { auditLogs, branches, roles, userBranches, userRoles, users } from "@/db/schema";
import type { Identity } from "@/lib/auth";
import {
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_EVENT_META,
  type ActivityCategory,
  type ActivityEvent,
  type ActivityScopeMode,
  type ActivityTone,
  allowedActivityEventsForActor,
  currentOmanDayBounds,
  DAILY_ACTIVITY_PAGE_SIZE,
  formatActivitySummary,
  formatEntityTypeLabel,
  normalizeActivityTypeFilter,
  parseOmanDateTimeRange,
  resolveActivityHref,
  resolveActivityScopeMode,
  resolveEffectiveActivityEvent,
  resolveFilteredActivityEvents,
} from "./calculations";

const uuidSchema = z.string().uuid();

const effectiveEventSql = sql<string>`CASE
  WHEN ${auditLogs.event} = 'VEHICLE_UPDATED'
    AND ${auditLogs.metadata}->>'action' IN ('BLACKLIST_CREATED','BLACKLIST_UPDATED','BLACKLIST_REMOVED','BOOKING_UPDATED','BOOKING_DELETED')
    THEN ${auditLogs.metadata}->>'action'
  WHEN ${auditLogs.event} = 'VEHICLE_UPDATED' AND ${auditLogs.entityType} = 'customer'
    THEN CASE WHEN ${auditLogs.metadata}->>'active' = 'false' THEN 'CUSTOMER_DEACTIVATED' ELSE 'CUSTOMER_UPDATED' END
  WHEN ${auditLogs.event} = 'VEHICLE_UPDATED' AND ${auditLogs.entityType} = 'customer_blacklist'
    THEN 'BLACKLIST_UPDATED'
  ELSE ${auditLogs.event}::text
END`;

type DailyActivityFilters = {
  q?: string;
  branchId?: string;
  userId?: string;
  from?: string;
  to?: string;
  activityType?: string;
  page?: number;
};

type DailyActivityEntry = {
  id: string;
  createdAt: Date;
  event: ActivityEvent;
  label: string;
  category: Exclude<ActivityCategory, "ALL">;
  categoryLabel: string;
  tone: ActivityTone;
  entityType: string;
  entityLabel: string;
  entityId: string | null;
  actorId: string | null;
  actorName: string;
  actorUsername: string | null;
  branchId: string | null;
  branchName: string | null;
  branchCode: string | null;
  summary: string;
  href: string | null;
};

type DailyActivityResult = {
  scopeMode: ActivityScopeMode;
  entries: DailyActivityEntry[];
  totalMatching: number;
  todayCount: number;
  distinctActors: number;
  page: number;
  totalPages: number;
  pageSize: number;
  allowedEvents: ActivityEvent[];
  branches: { id: string; name: string; code: string }[];
  users: { id: string; displayName: string; username: string }[];
  filters: {
    q: string;
    branchId: string;
    userId: string;
    from: string;
    to: string;
    activityType: string;
  };
};

export async function loadDailyActivity(
  actor: Identity,
  locale: string,
  rawFilters: DailyActivityFilters = {},
): Promise<DailyActivityResult> {
  const scopeMode = resolveActivityScopeMode(actor);
  const allowedEvents = allowedActivityEventsForActor(actor);
  const normalizedType = normalizeActivityTypeFilter(rawFilters.activityType);
  const filteredEvents = resolveFilteredActivityEvents(normalizedType, allowedEvents);
  const q = (rawFilters.q ?? "").trim().slice(0, 120);
  const { validFrom, validTo, fromDate, toDate } = parseOmanDateTimeRange(
    rawFilters.from,
    rawFilters.to,
  );
  const requestedPage = Math.max(1, Math.trunc(rawFilters.page ?? 1) || 1);

  let branchOptions: { id: string; name: string; code: string }[] = [];
  let userOptions: { id: string; displayName: string; username: string }[] = [];
  let superAdminIds: string[] = [];
  let permittedUserIds: string[] = [actor.id];

  if (scopeMode === "ALL") {
    [branchOptions, userOptions] = await Promise.all([
      db
        .select({ id: branches.id, name: branches.name, code: branches.code })
        .from(branches)
        .orderBy(asc(branches.name)),
      db
        .select({ id: users.id, displayName: users.displayName, username: users.username })
        .from(users)
        .orderBy(asc(users.displayName)),
    ]);
    permittedUserIds = userOptions.map((u) => u.id);
  } else if (scopeMode === "BRANCH_ADMIN") {
    const [branchRows, superRows, branchUserRows] = await Promise.all([
      actor.branchIds.length
        ? db
            .select({ id: branches.id, name: branches.name, code: branches.code })
            .from(branches)
            .where(inArray(branches.id, actor.branchIds))
            .orderBy(asc(branches.name))
        : Promise.resolve([]),
      db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(roles.name, "SUPER_ADMIN")),
      actor.branchIds.length
        ? db
            .select({ userId: userBranches.userId })
            .from(userBranches)
            .where(inArray(userBranches.branchId, actor.branchIds))
        : Promise.resolve([]),
    ]);
    branchOptions = branchRows;
    superAdminIds = [...new Set(superRows.map((r) => r.userId))];
    const superAdminSet = new Set(superAdminIds);
    permittedUserIds = [
      ...new Set([
        actor.id,
        ...branchUserRows.map((r) => r.userId).filter((id) => !superAdminSet.has(id)),
      ]),
    ];
    userOptions = permittedUserIds.length
      ? await db
          .select({ id: users.id, displayName: users.displayName, username: users.username })
          .from(users)
          .where(inArray(users.id, permittedUserIds))
          .orderBy(asc(users.displayName))
      : [];
  } else {
    branchOptions = actor.branchIds.length
      ? await db
          .select({ id: branches.id, name: branches.name, code: branches.code })
          .from(branches)
          .where(inArray(branches.id, actor.branchIds))
          .orderBy(asc(branches.name))
      : [];
    userOptions = [{ id: actor.id, displayName: actor.displayName, username: actor.username }];
    permittedUserIds = [actor.id];
  }

  const permittedBranchSet = new Set(branchOptions.map((b) => b.id));
  const permittedUserSet = new Set(permittedUserIds);

  const rawBranchId = (rawFilters.branchId ?? "").trim();
  const rawUserId = (rawFilters.userId ?? "").trim();
  const branchIdIsUuid = Boolean(rawBranchId && uuidSchema.safeParse(rawBranchId).success);
  const userIdIsUuid = Boolean(rawUserId && uuidSchema.safeParse(rawUserId).success);

  const validBranchId = branchIdIsUuid && permittedBranchSet.has(rawBranchId) ? rawBranchId : "";
  const validUserId =
    scopeMode !== "SELF" && userIdIsUuid && permittedUserSet.has(rawUserId) ? rawUserId : "";

  // Never allow query params to widen scope; if an explicit unauthorized UUID is requested, return 0 rows.
  const unauthorizedFilterProbe =
    (branchIdIsUuid && !permittedBranchSet.has(rawBranchId)) ||
    (scopeMode !== "SELF" && userIdIsUuid && !permittedUserSet.has(rawUserId));

  const emptyFilters = {
    q,
    branchId: validBranchId,
    userId: validUserId,
    from: validFrom,
    to: validTo,
    activityType: normalizedType,
  };

  if (allowedEvents.length === 0) {
    return {
      scopeMode,
      entries: [],
      totalMatching: 0,
      todayCount: 0,
      distinctActors: 0,
      page: 1,
      totalPages: 1,
      pageSize: DAILY_ACTIVITY_PAGE_SIZE,
      allowedEvents,
      branches: branchOptions,
      users: userOptions,
      filters: emptyFilters,
    };
  }

  // Base RBAC visibility scope (applies to both today KPI and filtered query)
  const baseScopeConditions: SQL[] = [];
  const allowedEventsSql = sql`${effectiveEventSql} IN (${sql.join(
    allowedEvents.map((e) => sql`${e}`),
    sql`, `,
  )})`;
  baseScopeConditions.push(allowedEventsSql);

  if (scopeMode === "BRANCH_ADMIN") {
    const nonSuperActor = superAdminIds.length
      ? or(isNull(auditLogs.actorId), notInArray(auditLogs.actorId, superAdminIds))
      : undefined;
    if (actor.branchIds.length > 0) {
      const branchScope = or(
        nonSuperActor
          ? and(inArray(auditLogs.branchId, actor.branchIds), nonSuperActor)
          : inArray(auditLogs.branchId, actor.branchIds),
        and(isNull(auditLogs.branchId), inArray(auditLogs.actorId, permittedUserIds)),
      );
      if (branchScope) baseScopeConditions.push(branchScope);
    } else {
      const ownGlobal = and(isNull(auditLogs.branchId), eq(auditLogs.actorId, actor.id));
      if (ownGlobal) baseScopeConditions.push(ownGlobal);
    }
  } else if (scopeMode === "SELF") {
    baseScopeConditions.push(eq(auditLogs.actorId, actor.id));
    if (actor.branchIds.length > 0) {
      const ownBranchOrGlobal = or(
        isNull(auditLogs.branchId),
        inArray(auditLogs.branchId, actor.branchIds),
      );
      if (ownBranchOrGlobal) baseScopeConditions.push(ownBranchOrGlobal);
    } else {
      baseScopeConditions.push(isNull(auditLogs.branchId));
    }
  }

  const { todayStart } = currentOmanDayBounds();

  // If the selected activity type has no allowed events or an unauthorized UUID was probed,
  // still compute todayCount cleanly and return 0 matching rows.
  if (filteredEvents.length === 0 || unauthorizedFilterProbe) {
    const [todayRow] = await db
      .select({ total: count() })
      .from(auditLogs)
      .where(and(...baseScopeConditions, gte(auditLogs.createdAt, todayStart)));

    return {
      scopeMode,
      entries: [],
      totalMatching: 0,
      todayCount: todayRow?.total ?? 0,
      distinctActors: 0,
      page: 1,
      totalPages: 1,
      pageSize: DAILY_ACTIVITY_PAGE_SIZE,
      allowedEvents,
      branches: branchOptions,
      users: userOptions,
      filters: emptyFilters,
    };
  }

  const filterConditions: SQL[] = [...baseScopeConditions];

  if (normalizedType !== "ALL") {
    filterConditions.push(
      sql`${effectiveEventSql} IN (${sql.join(
        filteredEvents.map((e) => sql`${e}`),
        sql`, `,
      )})`,
    );
  }
  if (validBranchId) {
    filterConditions.push(eq(auditLogs.branchId, validBranchId));
  }
  if (validUserId) {
    filterConditions.push(eq(auditLogs.actorId, validUserId));
  }
  if (fromDate) {
    filterConditions.push(gte(auditLogs.createdAt, fromDate));
  }
  if (toDate) {
    filterConditions.push(lte(auditLogs.createdAt, toDate));
  }
  if (q) {
    const pattern = `%${q}%`;
    const searchCond = or(
      ilike(users.displayName, pattern),
      ilike(users.username, pattern),
      ilike(branches.name, pattern),
      ilike(branches.code, pattern),
      ilike(auditLogs.entityType, pattern),
      ilike(auditLogs.entityId, pattern),
      sql`${effectiveEventSql} ILIKE ${pattern}`,
      sql`${auditLogs.metadata}::text ILIKE ${pattern}`,
    );
    if (searchCond) filterConditions.push(searchCond);
  }

  const whereClause = and(...filterConditions);

  const [[statsRow], [todayRow]] = await Promise.all([
    db
      .select({
        total: count(),
        distinctActors: countDistinct(auditLogs.actorId),
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .leftJoin(branches, eq(branches.id, auditLogs.branchId))
      .where(whereClause),
    db
      .select({ total: count() })
      .from(auditLogs)
      .where(and(...baseScopeConditions, gte(auditLogs.createdAt, todayStart))),
  ]);

  const totalMatching = statsRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalMatching / DAILY_ACTIVITY_PAGE_SIZE));
  const page = Math.min(totalPages, requestedPage);
  const offset = (page - 1) * DAILY_ACTIVITY_PAGE_SIZE;

  const rawRows = await db
    .select({
      id: auditLogs.id,
      createdAt: auditLogs.createdAt,
      event: auditLogs.event,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      actorId: auditLogs.actorId,
      actorDisplayName: users.displayName,
      actorUsername: users.username,
      branchId: auditLogs.branchId,
      branchName: branches.name,
      branchCode: branches.code,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .leftJoin(branches, eq(branches.id, auditLogs.branchId))
    .where(whereClause)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(DAILY_ACTIVITY_PAGE_SIZE)
    .offset(offset);

  const entries: DailyActivityEntry[] = rawRows.map((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    const effectiveEvent = resolveEffectiveActivityEvent(row.event, row.entityType, metadata);
    const meta = ACTIVITY_EVENT_META[effectiveEvent];
    const displayInput = {
      effectiveEvent,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata,
    };

    return {
      id: row.id,
      createdAt: row.createdAt,
      event: effectiveEvent,
      label: meta.label,
      category: meta.category,
      categoryLabel: ACTIVITY_CATEGORY_LABELS[meta.category],
      tone: meta.tone,
      entityType: row.entityType,
      entityLabel: formatEntityTypeLabel(row.entityType),
      entityId: row.entityId,
      actorId: row.actorId,
      actorName: row.actorDisplayName ?? (row.actorId ? "Former user" : "System / Guest"),
      actorUsername: row.actorUsername ?? null,
      branchId: row.branchId,
      branchName: row.branchName ?? null,
      branchCode: row.branchCode ?? null,
      summary: formatActivitySummary(displayInput),
      href: resolveActivityHref(locale, displayInput, actor),
    };
  });

  return {
    scopeMode,
    entries,
    totalMatching,
    todayCount: todayRow?.total ?? 0,
    distinctActors: statsRow?.distinctActors ?? 0,
    page,
    totalPages,
    pageSize: DAILY_ACTIVITY_PAGE_SIZE,
    allowedEvents,
    branches: branchOptions,
    users: userOptions,
    filters: emptyFilters,
  };
}
