import { formatOmanDateTime, parseOmanDateTime } from "@/features/rentals/booking-calculations";
import { formatOMR } from "@/features/rentals/calculations";

export const DAILY_ACTIVITY_PAGE_SIZE = 15;

export const ACTIVITY_CATEGORIES = [
  "ALL",
  "AUTH",
  "BRANCHES",
  "USERS",
  "FLEET",
  "CUSTOMERS",
  "BLACKLIST",
  "BOOKINGS_RENTALS",
  "TRANSFERS",
  "FINANCE",
  "INVOICES",
  "SERVICES",
  "SETTINGS",
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  ALL: "All activity types",
  AUTH: "Authentication",
  BRANCHES: "Branches",
  USERS: "Users & Access",
  FLEET: "Vehicles & Brands",
  CUSTOMERS: "Customers",
  BLACKLIST: "Blacklist",
  BOOKINGS_RENTALS: "Bookings & Rentals",
  TRANSFERS: "Transfers & Swaps",
  FINANCE: "Payments & Fines",
  INVOICES: "Invoices",
  SERVICES: "Vehicle Services",
  SETTINGS: "Settings & Signatures",
};

export const ACTIVITY_EVENTS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "LOGOUT",
  "PASSWORD_CHANGED",
  "BRANCH_CREATED",
  "BRANCH_UPDATED",
  "BRANCH_DEACTIVATED",
  "BRANCH_DELETED",
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DEACTIVATED",
  "ROLE_CHANGED",
  "PERMISSIONS_CHANGED",
  "BRAND_CREATED",
  "BRAND_UPDATED",
  "BRAND_DEACTIVATED",
  "VEHICLE_CREATED",
  "VEHICLE_UPDATED",
  "VEHICLE_DEACTIVATED",
  "PRICE_OVERRIDDEN",
  "ODOMETER_RECORDED",
  "CUSTOMER_CREATED",
  "CUSTOMER_UPDATED",
  "CUSTOMER_DEACTIVATED",
  "CUSTOMER_DELETED",
  "BLACKLIST_CREATED",
  "BLACKLIST_UPDATED",
  "BLACKLIST_REMOVED",
  "BOOKING_CREATED",
  "BOOKING_UPDATED",
  "BOOKING_DELETED",
  "RENTAL_STARTED",
  "RENTAL_EXTENDED",
  "RENTAL_RETURNED",
  "RENTAL_CANCELLED",
  "DAMAGE_RECORDED",
  "VEHICLE_TRANSFERRED",
  "VEHICLE_SWAPPED",
  "ADVANCE_RECORDED",
  "RECEIPT_RECORDED",
  "PAYBACK_RECORDED",
  "PAYMENT_CORRECTED",
  "REFUND_APPROVED",
  "FINE_RECORDED",
  "LEGAL_FINE_RECORDED",
  "LEGAL_FINE_UPDATED",
  "LEGAL_FINE_DELETED",
  "INVOICE_CREATED",
  "INVOICE_UPDATED",
  "INVOICE_FINALIZED",
  "INVOICE_VOIDED",
  "SERVICE_CREATED",
  "SERVICE_UPDATED",
  "SERVICE_COMPLETED",
  "SETTINGS_UPDATED",
  "SIGNATURE_UPDATED",
] as const;

export type ActivityEvent = (typeof ACTIVITY_EVENTS)[number];

export type ActivityTone = "emerald" | "sky" | "amber" | "red" | "violet" | "neutral";

type RequiredModuleRule =
  | "super_only"
  | "auth"
  | "branches"
  | "users"
  | "fleet"
  | "customers"
  | "bookings_or_rentals"
  | "rentals"
  | "finance"
  | "settings"
  | "settings_or_users";

type ActivityEventMeta = {
  event: ActivityEvent;
  label: string;
  category: Exclude<ActivityCategory, "ALL">;
  tone: ActivityTone;
  moduleRule: RequiredModuleRule;
};

export const ACTIVITY_EVENT_META: Record<ActivityEvent, ActivityEventMeta> = {
  LOGIN_SUCCESS: {
    event: "LOGIN_SUCCESS",
    label: "Login Success",
    category: "AUTH",
    tone: "emerald",
    moduleRule: "auth",
  },
  LOGIN_FAILURE: {
    event: "LOGIN_FAILURE",
    label: "Login Failure",
    category: "AUTH",
    tone: "red",
    moduleRule: "super_only",
  },
  LOGOUT: {
    event: "LOGOUT",
    label: "Logout",
    category: "AUTH",
    tone: "neutral",
    moduleRule: "auth",
  },
  PASSWORD_CHANGED: {
    event: "PASSWORD_CHANGED",
    label: "Password Changed",
    category: "AUTH",
    tone: "amber",
    moduleRule: "auth",
  },
  BRANCH_CREATED: {
    event: "BRANCH_CREATED",
    label: "Branch Created",
    category: "BRANCHES",
    tone: "emerald",
    moduleRule: "branches",
  },
  BRANCH_UPDATED: {
    event: "BRANCH_UPDATED",
    label: "Branch Updated",
    category: "BRANCHES",
    tone: "sky",
    moduleRule: "branches",
  },
  BRANCH_DEACTIVATED: {
    event: "BRANCH_DEACTIVATED",
    label: "Branch Deactivated",
    category: "BRANCHES",
    tone: "amber",
    moduleRule: "branches",
  },
  BRANCH_DELETED: {
    event: "BRANCH_DELETED",
    label: "Branch Deleted",
    category: "BRANCHES",
    tone: "red",
    moduleRule: "branches",
  },
  USER_CREATED: {
    event: "USER_CREATED",
    label: "User Created",
    category: "USERS",
    tone: "emerald",
    moduleRule: "users",
  },
  USER_UPDATED: {
    event: "USER_UPDATED",
    label: "User Updated",
    category: "USERS",
    tone: "sky",
    moduleRule: "users",
  },
  USER_DEACTIVATED: {
    event: "USER_DEACTIVATED",
    label: "User Deactivated",
    category: "USERS",
    tone: "amber",
    moduleRule: "users",
  },
  ROLE_CHANGED: {
    event: "ROLE_CHANGED",
    label: "Role Changed",
    category: "USERS",
    tone: "violet",
    moduleRule: "users",
  },
  PERMISSIONS_CHANGED: {
    event: "PERMISSIONS_CHANGED",
    label: "Permissions Changed",
    category: "USERS",
    tone: "violet",
    moduleRule: "users",
  },
  BRAND_CREATED: {
    event: "BRAND_CREATED",
    label: "Brand / Model Created",
    category: "FLEET",
    tone: "emerald",
    moduleRule: "fleet",
  },
  BRAND_UPDATED: {
    event: "BRAND_UPDATED",
    label: "Brand / Model Updated",
    category: "FLEET",
    tone: "sky",
    moduleRule: "fleet",
  },
  BRAND_DEACTIVATED: {
    event: "BRAND_DEACTIVATED",
    label: "Brand / Model Deactivated",
    category: "FLEET",
    tone: "amber",
    moduleRule: "fleet",
  },
  VEHICLE_CREATED: {
    event: "VEHICLE_CREATED",
    label: "Vehicle Added",
    category: "FLEET",
    tone: "emerald",
    moduleRule: "fleet",
  },
  VEHICLE_UPDATED: {
    event: "VEHICLE_UPDATED",
    label: "Vehicle Updated",
    category: "FLEET",
    tone: "sky",
    moduleRule: "fleet",
  },
  VEHICLE_DEACTIVATED: {
    event: "VEHICLE_DEACTIVATED",
    label: "Vehicle Deactivated",
    category: "FLEET",
    tone: "amber",
    moduleRule: "fleet",
  },
  PRICE_OVERRIDDEN: {
    event: "PRICE_OVERRIDDEN",
    label: "Price Overridden",
    category: "FLEET",
    tone: "amber",
    moduleRule: "fleet",
  },
  ODOMETER_RECORDED: {
    event: "ODOMETER_RECORDED",
    label: "Odometer Recorded",
    category: "FLEET",
    tone: "neutral",
    moduleRule: "fleet",
  },
  CUSTOMER_CREATED: {
    event: "CUSTOMER_CREATED",
    label: "Customer Created",
    category: "CUSTOMERS",
    tone: "emerald",
    moduleRule: "customers",
  },
  CUSTOMER_UPDATED: {
    event: "CUSTOMER_UPDATED",
    label: "Customer Updated",
    category: "CUSTOMERS",
    tone: "sky",
    moduleRule: "customers",
  },
  CUSTOMER_DEACTIVATED: {
    event: "CUSTOMER_DEACTIVATED",
    label: "Customer Deactivated",
    category: "CUSTOMERS",
    tone: "amber",
    moduleRule: "customers",
  },
  CUSTOMER_DELETED: {
    event: "CUSTOMER_DELETED",
    label: "Customer Deleted",
    category: "CUSTOMERS",
    tone: "red",
    moduleRule: "customers",
  },
  BLACKLIST_CREATED: {
    event: "BLACKLIST_CREATED",
    label: "Customer Blacklisted",
    category: "BLACKLIST",
    tone: "red",
    moduleRule: "customers",
  },
  BLACKLIST_UPDATED: {
    event: "BLACKLIST_UPDATED",
    label: "Blacklist Updated",
    category: "BLACKLIST",
    tone: "amber",
    moduleRule: "customers",
  },
  BLACKLIST_REMOVED: {
    event: "BLACKLIST_REMOVED",
    label: "Blacklist Removed",
    category: "BLACKLIST",
    tone: "emerald",
    moduleRule: "customers",
  },
  BOOKING_CREATED: {
    event: "BOOKING_CREATED",
    label: "Booking Created",
    category: "BOOKINGS_RENTALS",
    tone: "emerald",
    moduleRule: "bookings_or_rentals",
  },
  BOOKING_UPDATED: {
    event: "BOOKING_UPDATED",
    label: "Booking Updated",
    category: "BOOKINGS_RENTALS",
    tone: "sky",
    moduleRule: "bookings_or_rentals",
  },
  BOOKING_DELETED: {
    event: "BOOKING_DELETED",
    label: "Booking Deleted",
    category: "BOOKINGS_RENTALS",
    tone: "red",
    moduleRule: "bookings_or_rentals",
  },
  RENTAL_STARTED: {
    event: "RENTAL_STARTED",
    label: "Rental Started",
    category: "BOOKINGS_RENTALS",
    tone: "emerald",
    moduleRule: "rentals",
  },
  RENTAL_EXTENDED: {
    event: "RENTAL_EXTENDED",
    label: "Rental Extended",
    category: "BOOKINGS_RENTALS",
    tone: "sky",
    moduleRule: "rentals",
  },
  RENTAL_RETURNED: {
    event: "RENTAL_RETURNED",
    label: "Rental Returned",
    category: "BOOKINGS_RENTALS",
    tone: "sky",
    moduleRule: "rentals",
  },
  RENTAL_CANCELLED: {
    event: "RENTAL_CANCELLED",
    label: "Rental Cancelled",
    category: "BOOKINGS_RENTALS",
    tone: "red",
    moduleRule: "rentals",
  },
  DAMAGE_RECORDED: {
    event: "DAMAGE_RECORDED",
    label: "Damage Recorded",
    category: "BOOKINGS_RENTALS",
    tone: "red",
    moduleRule: "rentals",
  },
  VEHICLE_TRANSFERRED: {
    event: "VEHICLE_TRANSFERRED",
    label: "Vehicle Transferred",
    category: "TRANSFERS",
    tone: "violet",
    moduleRule: "rentals",
  },
  VEHICLE_SWAPPED: {
    event: "VEHICLE_SWAPPED",
    label: "Vehicle Swapped",
    category: "TRANSFERS",
    tone: "violet",
    moduleRule: "rentals",
  },
  ADVANCE_RECORDED: {
    event: "ADVANCE_RECORDED",
    label: "Advance Recorded",
    category: "FINANCE",
    tone: "emerald",
    moduleRule: "finance",
  },
  RECEIPT_RECORDED: {
    event: "RECEIPT_RECORDED",
    label: "Receipt Recorded",
    category: "FINANCE",
    tone: "emerald",
    moduleRule: "finance",
  },
  PAYBACK_RECORDED: {
    event: "PAYBACK_RECORDED",
    label: "Payback Recorded",
    category: "FINANCE",
    tone: "amber",
    moduleRule: "finance",
  },
  PAYMENT_CORRECTED: {
    event: "PAYMENT_CORRECTED",
    label: "Payment Corrected",
    category: "FINANCE",
    tone: "amber",
    moduleRule: "finance",
  },
  REFUND_APPROVED: {
    event: "REFUND_APPROVED",
    label: "Refund Approved",
    category: "FINANCE",
    tone: "emerald",
    moduleRule: "finance",
  },
  FINE_RECORDED: {
    event: "FINE_RECORDED",
    label: "Fine Recorded",
    category: "FINANCE",
    tone: "red",
    moduleRule: "finance",
  },
  LEGAL_FINE_RECORDED: {
    event: "LEGAL_FINE_RECORDED",
    label: "Legal Fine Recorded",
    category: "FINANCE",
    tone: "red",
    moduleRule: "finance",
  },
  LEGAL_FINE_UPDATED: {
    event: "LEGAL_FINE_UPDATED",
    label: "Legal Fine Updated",
    category: "FINANCE",
    tone: "amber",
    moduleRule: "finance",
  },
  LEGAL_FINE_DELETED: {
    event: "LEGAL_FINE_DELETED",
    label: "Legal Fine Deleted",
    category: "FINANCE",
    tone: "red",
    moduleRule: "finance",
  },
  INVOICE_CREATED: {
    event: "INVOICE_CREATED",
    label: "Invoice Created",
    category: "INVOICES",
    tone: "sky",
    moduleRule: "finance",
  },
  INVOICE_UPDATED: {
    event: "INVOICE_UPDATED",
    label: "Invoice Updated",
    category: "INVOICES",
    tone: "sky",
    moduleRule: "finance",
  },
  INVOICE_FINALIZED: {
    event: "INVOICE_FINALIZED",
    label: "Invoice Finalized",
    category: "INVOICES",
    tone: "emerald",
    moduleRule: "finance",
  },
  INVOICE_VOIDED: {
    event: "INVOICE_VOIDED",
    label: "Invoice Voided",
    category: "INVOICES",
    tone: "red",
    moduleRule: "finance",
  },
  SERVICE_CREATED: {
    event: "SERVICE_CREATED",
    label: "Service Scheduled",
    category: "SERVICES",
    tone: "sky",
    moduleRule: "fleet",
  },
  SERVICE_UPDATED: {
    event: "SERVICE_UPDATED",
    label: "Service Updated",
    category: "SERVICES",
    tone: "amber",
    moduleRule: "fleet",
  },
  SERVICE_COMPLETED: {
    event: "SERVICE_COMPLETED",
    label: "Service Completed",
    category: "SERVICES",
    tone: "emerald",
    moduleRule: "fleet",
  },
  SETTINGS_UPDATED: {
    event: "SETTINGS_UPDATED",
    label: "Settings Updated",
    category: "SETTINGS",
    tone: "violet",
    moduleRule: "settings",
  },
  SIGNATURE_UPDATED: {
    event: "SIGNATURE_UPDATED",
    label: "Signature Updated",
    category: "SETTINGS",
    tone: "violet",
    moduleRule: "settings_or_users",
  },
};

const ACTIVITY_EVENT_SET = new Set<string>(ACTIVITY_EVENTS);
const ACTIVITY_CATEGORY_SET = new Set<string>(ACTIVITY_CATEGORIES);

export type ActivityScopeMode = "ALL" | "BRANCH_ADMIN" | "SELF";

export type ActivityActorLike = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  branchIds: string[];
  permissions: Set<string>;
};

export function resolveActivityScopeMode(actor: ActivityActorLike): ActivityScopeMode {
  if (actor.role === "SUPER_ADMIN") return "ALL";
  if (
    actor.role === "ADMIN" ||
    actor.permissions.has("users:read") ||
    actor.permissions.has("reports:read")
  ) {
    return "BRANCH_ADMIN";
  }
  return "SELF";
}

export function canAccessDailyActivity(actor: ActivityActorLike): boolean {
  return actor.role === "SUPER_ADMIN" || actor.permissions.size > 0;
}

function actorCanReadRule(actor: ActivityActorLike, rule: RequiredModuleRule): boolean {
  if (actor.role === "SUPER_ADMIN") return true;
  switch (rule) {
    case "super_only":
      return false;
    case "auth":
      return actor.permissions.size > 0;
    case "branches":
      return actor.permissions.has("branches:read");
    case "users":
      return actor.permissions.has("users:read");
    case "fleet":
      return actor.permissions.has("fleet:read");
    case "customers":
      return actor.permissions.has("customers:read");
    case "bookings_or_rentals":
      return actor.permissions.has("rentals:read") || actor.permissions.has("bookings:read");
    case "rentals":
      return actor.permissions.has("rentals:read");
    case "finance":
      return actor.permissions.has("finance:read");
    case "settings":
      return actor.permissions.has("settings:read");
    case "settings_or_users":
      return actor.permissions.has("settings:read") || actor.permissions.has("users:read");
  }
}

export function allowedActivityEventsForActor(actor: ActivityActorLike): ActivityEvent[] {
  return ACTIVITY_EVENTS.filter((event) =>
    actorCanReadRule(actor, ACTIVITY_EVENT_META[event].moduleRule),
  );
}

function eventsForCategory(category: Exclude<ActivityCategory, "ALL">): ActivityEvent[] {
  return ACTIVITY_EVENTS.filter((event) => ACTIVITY_EVENT_META[event].category === category);
}

/**
 * Normalizes legacy audit rows written before migration 0013 (where blacklist,
 * customer, or booking mutations temporarily reused the VEHICLE_UPDATED enum).
 */
export function resolveEffectiveActivityEvent(
  event: string,
  entityType: string,
  metadata: Record<string, unknown> | null | undefined,
): ActivityEvent {
  if (event === "VEHICLE_UPDATED") {
    const action = typeof metadata?.action === "string" ? metadata.action : "";
    if (action && ACTIVITY_EVENT_SET.has(action)) {
      return action as ActivityEvent;
    }
    if (entityType === "customer") {
      return metadata?.active === false ? "CUSTOMER_DEACTIVATED" : "CUSTOMER_UPDATED";
    }
    if (entityType === "customer_blacklist") {
      return "BLACKLIST_UPDATED";
    }
  }
  if (ACTIVITY_EVENT_SET.has(event)) {
    return event as ActivityEvent;
  }
  return "VEHICLE_UPDATED";
}

export function normalizeActivityTypeFilter(raw?: string): string {
  const candidate = (raw ?? "ALL").trim().toUpperCase();
  if (candidate === "ALL" || !candidate) return "ALL";
  if (ACTIVITY_CATEGORY_SET.has(candidate)) return candidate;
  if (ACTIVITY_EVENT_SET.has(candidate)) return candidate;
  return "ALL";
}

export function resolveFilteredActivityEvents(
  activityType: string,
  allowedEvents: readonly ActivityEvent[],
): ActivityEvent[] {
  const normalized = normalizeActivityTypeFilter(activityType);
  if (normalized === "ALL") return [...allowedEvents];
  const allowedSet = new Set(allowedEvents);
  if (ACTIVITY_CATEGORY_SET.has(normalized) && normalized !== "ALL") {
    return eventsForCategory(normalized as Exclude<ActivityCategory, "ALL">).filter((e) =>
      allowedSet.has(e),
    );
  }
  if (ACTIVITY_EVENT_SET.has(normalized)) {
    return allowedSet.has(normalized as ActivityEvent) ? [normalized as ActivityEvent] : [];
  }
  return [...allowedEvents];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function parseOmanBound(
  raw: string | undefined,
  bound: "from" | "to",
): { normalized: string; date: Date } | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;

  if (ISO_DATETIME_RE.test(trimmed)) {
    try {
      const start = parseOmanDateTime(trimmed);
      // Include the entire selected minute on the upper bound (HH:MM:59.999)
      const date = bound === "to" ? new Date(start.getTime() + 59_999) : start;
      return { normalized: trimmed, date };
    } catch {
      return null;
    }
  }

  if (ISO_DATE_RE.test(trimmed)) {
    const fallback = `${trimmed}T${bound === "from" ? "00:00" : "23:59"}`;
    try {
      const start = parseOmanDateTime(fallback);
      const date = bound === "to" ? new Date(start.getTime() + 59_999) : start;
      return { normalized: fallback, date };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Parses inclusive Oman date-time bounds (YYYY-MM-DDTHH:MM or YYYY-MM-DD, Asia/Muscat UTC+04:00).
 * Swaps bounds safely if `from` is later than `to`.
 */
export function parseOmanDateTimeRange(
  fromRaw?: string,
  toRaw?: string,
): {
  validFrom: string;
  validTo: string;
  fromDate?: Date;
  toDate?: Date;
} {
  let fromParsed = parseOmanBound(fromRaw, "from");
  let toParsed = parseOmanBound(toRaw, "to");

  if (fromParsed && toParsed && fromParsed.date > toParsed.date) {
    const swappedFrom = parseOmanBound(toParsed.normalized, "from");
    const swappedTo = parseOmanBound(fromParsed.normalized, "to");
    fromParsed = swappedFrom;
    toParsed = swappedTo;
  }

  return {
    validFrom: fromParsed?.normalized ?? "",
    validTo: toParsed?.normalized ?? "",
    fromDate: fromParsed?.date,
    toDate: toParsed?.date,
  };
}

export function currentOmanDayBounds(now = new Date()): {
  todayStart: Date;
  todayStartInput: string;
  nowInput: string;
} {
  const nowInput = formatOmanDateTime(now);
  const todayDate = nowInput.slice(0, 10);
  const todayStartInput = `${todayDate}T00:00`;
  return {
    todayStart: parseOmanDateTime(todayStartInput),
    todayStartInput,
    nowInput,
  };
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asBaisa(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  return null;
}

type ActivityDisplayInput = {
  effectiveEvent: ActivityEvent;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null | undefined;
};

/**
 * Builds a concise, human-readable summary from structured audit metadata
 * without exposing sensitive internal fields (such as ipHash or password hashes).
 */
export function formatActivitySummary(row: ActivityDisplayInput): string {
  const m = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const parts: string[] = [];

  const agreement = asText(m.agreementNumber);
  if (agreement) parts.push(`Agreement ${agreement}`);

  const invoiceNumber = asText(m.invoiceNumber);
  if (invoiceNumber) parts.push(`Invoice ${invoiceNumber}`);

  const receiptNumber = asText(m.receiptNumber);
  if (receiptNumber) parts.push(`Receipt ${receiptNumber}`);

  const previousVehicle = asText(m.previousVehicle);
  const newVehicle = asText(m.newVehicle);
  if (previousVehicle && newVehicle) {
    parts.push(`${previousVehicle} → ${newVehicle}`);
  } else {
    const vehicleNumber = asText(m.vehicleNumber);
    const registrationNumber = asText(m.registrationNumber);
    if (vehicleNumber || registrationNumber) {
      parts.push([vehicleNumber, registrationNumber].filter(Boolean).join(" · "));
    }
  }

  const customerNumber = asText(m.customerNumber);
  const name = asText(m.name);
  const mobile = asText(m.mobile);
  if (name || customerNumber) {
    parts.push([name, customerNumber, mobile].filter(Boolean).join(" · "));
  } else if (asText(m.username) || asText(m.displayName)) {
    const displayName = asText(m.displayName);
    const username = asText(m.username);
    parts.push([displayName, username ? `@${username}` : ""].filter(Boolean).join(" "));
  }

  const branchCode = asText(m.code);
  if (branchCode && row.entityType === "branch") {
    parts.push(`Code ${branchCode}`);
  }

  if (row.effectiveEvent === "ROLE_CHANGED") {
    const fromRole = asText(m.from);
    const toRole = asText(m.to);
    if (fromRole && toRole) parts.push(`${fromRole} → ${toRole}`);
    else if (toRole) parts.push(`Assigned ${toRole}`);
  }

  if (row.effectiveEvent === "PERMISSIONS_CHANGED") {
    const added = Array.isArray(m.added) ? m.added.length : 0;
    const removed = Array.isArray(m.removed) ? m.removed.length : 0;
    const total = typeof m.total === "number" ? m.total : null;
    const summaryBits: string[] = [];
    if (added) summaryBits.push(`+${added}`);
    if (removed) summaryBits.push(`-${removed}`);
    if (total !== null) summaryBits.push(`${total} granted`);
    if (summaryBits.length) parts.push(summaryBits.join(" / "));
  }

  const baisaAmount =
    asBaisa(m.amountBaisa) ??
    asBaisa(m.grandTotalBaisa) ??
    asBaisa(m.totalBaisa) ??
    asBaisa(m.chargesBaisa) ??
    asBaisa(m.costBaisa) ??
    asBaisa(m.downPaymentBaisa);
  if (baisaAmount !== null && baisaAmount > 0) {
    parts.push(formatOMR(baisaAmount));
  }

  const method = asText(m.method);
  if (method) parts.push(method.replaceAll("_", " "));

  const serviceType = asText(m.serviceType);
  if (serviceType) parts.push(serviceType.replaceAll("_", " "));

  const status = asText(m.status);
  if (status) parts.push(`Status: ${status}`);

  if (m.imageUpdated === true) parts.push("Vehicle photo updated");
  if (m.deleted === true) parts.push("Permanently deleted");
  if (typeof m.active === "boolean") {
    parts.push(m.active ? "Activated" : "Deactivated");
  }

  const reason =
    asText(m.reason) ||
    asText((m.after as Record<string, unknown> | undefined)?.reason) ||
    asText(m.details) ||
    asText(m.remarks);
  if (reason) {
    parts.push(reason.length > 100 ? `${reason.slice(0, 97)}…` : reason);
  }

  if (parts.length > 0) return parts.join(" · ");

  if (row.effectiveEvent === "LOGIN_SUCCESS") return "Signed in to session";
  if (row.effectiveEvent === "LOGIN_FAILURE") return "Failed sign-in attempt";
  if (row.effectiveEvent === "LOGOUT") return "Signed out of session";
  if (row.effectiveEvent === "PASSWORD_CHANGED") return "Account password updated";
  if (row.effectiveEvent === "SETTINGS_UPDATED") return "Operational settings updated";
  if (row.effectiveEvent === "SIGNATURE_UPDATED") return "Authorised signature updated";

  return `${row.entityType.replaceAll("_", " ")}${row.entityId ? ` #${row.entityId.slice(0, 8)}` : ""}`;
}

export function resolveActivityHref(
  locale: string,
  row: ActivityDisplayInput,
  actor: ActivityActorLike,
): string | null {
  const canRead = (module: string, action = "read") =>
    actor.role === "SUPER_ADMIN" || actor.permissions.has(`${module}:${action}`);
  const m = row.metadata && typeof row.metadata === "object" ? row.metadata : {};

  switch (row.entityType) {
    case "rental":
      if (row.effectiveEvent === "BOOKING_DELETED") {
        return canRead("rentals") ? `/${locale}/rentals` : null;
      }
      if (row.entityId && canRead("rentals")) return `/${locale}/rentals/${row.entityId}`;
      return canRead("rentals") ? `/${locale}/rentals` : null;
    case "rental_swap": {
      const rentalId = asText(m.rentalId);
      if (rentalId && canRead("rentals")) return `/${locale}/rentals/${rentalId}`;
      return canRead("rentals") ? `/${locale}/transfers` : null;
    }
    case "invoice":
      if (row.entityId && canRead("finance")) return `/${locale}/invoices/${row.entityId}`;
      return canRead("finance") ? `/${locale}/invoices` : null;
    case "payment":
      if (row.entityId && canRead("finance", "print")) {
        return `/${locale}/documents/receipt/${row.entityId}`;
      }
      return canRead("finance") ? `/${locale}/finance/receipt` : null;
    case "fine":
      return canRead("finance") ? `/${locale}/finance/fines` : null;
    case "customer":
      if (row.effectiveEvent === "CUSTOMER_DELETED") {
        return canRead("customers") ? `/${locale}/customers` : null;
      }
      if (row.entityId && canRead("customers") && canRead("finance")) {
        return `/${locale}/ledger?customerId=${row.entityId}`;
      }
      return canRead("customers") ? `/${locale}/customers` : null;
    case "customer_blacklist":
      return canRead("customers") ? `/${locale}/customers/blacklist` : null;
    case "vehicle":
    case "brand":
      return canRead("fleet") ? `/${locale}/fleet` : null;
    case "service":
      return canRead("fleet") ? `/${locale}/service` : null;
    case "branch":
      return canRead("branches") ? `/${locale}/admin/branches` : null;
    case "user":
      return canRead("users") ? `/${locale}/admin/users` : null;
    case "settings":
      return canRead("settings") ? `/${locale}/settings` : null;
    default:
      return null;
  }
}

export function formatEntityTypeLabel(entityType: string): string {
  return entityType.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}
