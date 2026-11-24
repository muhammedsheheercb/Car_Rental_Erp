import { describe, expect, it } from "vitest";
import {
  ACTIVITY_EVENT_META,
  ACTIVITY_EVENTS,
  type ActivityActorLike,
  allowedActivityEventsForActor,
  canAccessDailyActivity,
  DAILY_ACTIVITY_PAGE_SIZE,
  formatActivitySummary,
  normalizeActivityTypeFilter,
  parseOmanDateTimeRange,
  resolveActivityHref,
  resolveActivityScopeMode,
  resolveEffectiveActivityEvent,
  resolveFilteredActivityEvents,
} from "@/features/daily-activity/calculations";
import { formatOMR } from "@/features/rentals/calculations";

const makeActor = (overrides: Partial<ActivityActorLike> = {}): ActivityActorLike => ({
  id: "00000000-0000-4000-8000-000000000001",
  role: "USER",
  branchIds: ["11111111-1111-4000-8000-000000000001"],
  permissions: new Set<string>(),
  ...overrides,
});

describe("Section 5 — Daily Activity domain logic & RBAC", () => {
  it("uses 15 items per page and defines metadata for every audit event", () => {
    expect(DAILY_ACTIVITY_PAGE_SIZE).toBe(15);
    for (const ev of ACTIVITY_EVENTS) {
      expect(ACTIVITY_EVENT_META[ev]).toBeDefined();
      expect(ACTIVITY_EVENT_META[ev].label.length).toBeGreaterThan(2);
    }
  });

  it("normalizes legacy VEHICLE_UPDATED audit entries accurately", () => {
    expect(
      resolveEffectiveActivityEvent("VEHICLE_UPDATED", "customer_blacklist", {
        action: "BLACKLIST_CREATED",
      }),
    ).toBe("BLACKLIST_CREATED");
    expect(
      resolveEffectiveActivityEvent("VEHICLE_UPDATED", "rental", { action: "BOOKING_UPDATED" }),
    ).toBe("BOOKING_UPDATED");
    expect(
      resolveEffectiveActivityEvent("VEHICLE_UPDATED", "rental", { action: "BOOKING_DELETED" }),
    ).toBe("BOOKING_DELETED");
    expect(resolveEffectiveActivityEvent("VEHICLE_UPDATED", "customer", { active: false })).toBe(
      "CUSTOMER_DEACTIVATED",
    );
    expect(resolveEffectiveActivityEvent("VEHICLE_UPDATED", "customer", { active: true })).toBe(
      "CUSTOMER_UPDATED",
    );
    expect(resolveEffectiveActivityEvent("VEHICLE_UPDATED", "vehicle", {})).toBe("VEHICLE_UPDATED");
    expect(resolveEffectiveActivityEvent("INVOICE_FINALIZED", "invoice", {})).toBe(
      "INVOICE_FINALIZED",
    );
  });

  it("resolves access scope modes cleanly for SUPER_ADMIN, admins, and regular users", () => {
    const superAdmin = makeActor({ role: "SUPER_ADMIN", branchIds: [], permissions: new Set() });
    const branchAdmin = makeActor({
      role: "ADMIN",
      permissions: new Set(["rentals:read", "fleet:read"]),
    });
    const reportSupervisor = makeActor({
      role: "USER",
      permissions: new Set(["reports:read", "finance:read"]),
    });
    const regularUser = makeActor({
      role: "USER",
      permissions: new Set(["rentals:read"]),
    });
    const zeroPermUser = makeActor({ role: "USER", permissions: new Set() });

    expect(resolveActivityScopeMode(superAdmin)).toBe("ALL");
    expect(canAccessDailyActivity(superAdmin)).toBe(true);

    expect(resolveActivityScopeMode(branchAdmin)).toBe("BRANCH_ADMIN");
    expect(resolveActivityScopeMode(reportSupervisor)).toBe("BRANCH_ADMIN");
    expect(resolveActivityScopeMode(regularUser)).toBe("SELF");
    expect(canAccessDailyActivity(regularUser)).toBe(true);
    expect(canAccessDailyActivity(zeroPermUser)).toBe(false);
  });

  it("restricts visible activity events strictly by actor role and module permissions", () => {
    const superAdmin = makeActor({ role: "SUPER_ADMIN" });
    const superEvents = allowedActivityEventsForActor(superAdmin);
    expect(superEvents).toHaveLength(ACTIVITY_EVENTS.length);
    expect(superEvents).toContain("LOGIN_FAILURE");
    expect(superEvents).toContain("LEGAL_FINE_DELETED");

    const fleetAndRentalAdmin = makeActor({
      role: "ADMIN",
      permissions: new Set(["fleet:read", "rentals:read"]),
    });
    const adminEvents = allowedActivityEventsForActor(fleetAndRentalAdmin);
    expect(adminEvents).toContain("VEHICLE_CREATED");
    expect(adminEvents).toContain("SERVICE_COMPLETED");
    expect(adminEvents).toContain("BOOKING_CREATED");
    expect(adminEvents).toContain("RENTAL_EXTENDED");
    expect(adminEvents).toContain("VEHICLE_SWAPPED");
    expect(adminEvents).toContain("LOGIN_SUCCESS");
    expect(adminEvents).not.toContain("LOGIN_FAILURE");
    expect(adminEvents).not.toContain("INVOICE_FINALIZED");
    expect(adminEvents).not.toContain("ADVANCE_RECORDED");
    expect(adminEvents).not.toContain("BLACKLIST_CREATED");
    expect(adminEvents).not.toContain("USER_CREATED");

    const bookingsOnlyUser = makeActor({
      role: "USER",
      permissions: new Set(["bookings:read"]),
    });
    const bookingEvents = allowedActivityEventsForActor(bookingsOnlyUser);
    expect(bookingEvents).toContain("BOOKING_CREATED");
    expect(bookingEvents).toContain("BOOKING_UPDATED");
    expect(bookingEvents).not.toContain("RENTAL_RETURNED");
    expect(bookingEvents).not.toContain("RECEIPT_RECORDED");
  });

  it("intersects category and exact event filters with actor permissions", () => {
    const financeOnly = allowedActivityEventsForActor(
      makeActor({ role: "USER", permissions: new Set(["finance:read"]) }),
    );
    expect(normalizeActivityTypeFilter("invoices")).toBe("INVOICES");
    expect(normalizeActivityTypeFilter("invalid_type")).toBe("ALL");

    expect(resolveFilteredActivityEvents("INVOICES", financeOnly)).toEqual([
      "INVOICE_CREATED",
      "INVOICE_UPDATED",
      "INVOICE_FINALIZED",
      "INVOICE_VOIDED",
    ]);
    expect(resolveFilteredActivityEvents("FLEET", financeOnly)).toEqual([]);
    expect(resolveFilteredActivityEvents("LOGIN_FAILURE", financeOnly)).toEqual([]);
    expect(resolveFilteredActivityEvents("LEGAL_FINE_RECORDED", financeOnly)).toEqual([
      "LEGAL_FINE_RECORDED",
    ]);
  });

  it("parses Oman date-time bounds inclusively, handles date-only fallback, and swaps inverted ranges", () => {
    const exact = parseOmanDateTimeRange("2026-11-24T09:00", "2026-11-24T17:30");
    expect(exact.validFrom).toBe("2026-11-24T09:00");
    expect(exact.validTo).toBe("2026-11-24T17:30");
    expect(exact.fromDate?.toISOString()).toBe("2026-11-24T05:00:00.000Z");
    // Inclusive of the full selected minute (:59.999)
    expect(exact.toDate?.toISOString()).toBe("2026-11-24T13:30:59.999Z");

    const dateOnly = parseOmanDateTimeRange("2026-11-20", "2026-11-21");
    expect(dateOnly.validFrom).toBe("2026-11-20T00:00");
    expect(dateOnly.validTo).toBe("2026-11-21T23:59");
    expect(dateOnly.fromDate?.toISOString()).toBe("2026-11-19T20:00:00.000Z");
    expect(dateOnly.toDate?.toISOString()).toBe("2026-11-21T19:59:59.999Z");

    const inverted = parseOmanDateTimeRange("2026-11-25T12:00", "2026-11-24T08:00");
    expect(inverted.validFrom).toBe("2026-11-24T08:00");
    expect(inverted.validTo).toBe("2026-11-25T12:00");
    expect(inverted.fromDate?.getTime()).toBeLessThan(inverted.toDate?.getTime() ?? 0);

    const invalid = parseOmanDateTimeRange("not-a-date", "2026-02-31T10:00");
    expect(invalid.validFrom).toBe("");
    expect(invalid.validTo).toBe("");
    expect(invalid.fromDate).toBeUndefined();
    expect(invalid.toDate).toBeUndefined();
  });

  it("formats readable activity summaries without leaking sensitive fields", () => {
    const paymentSummary = formatActivitySummary({
      effectiveEvent: "RECEIPT_RECORDED",
      entityType: "payment",
      entityId: "p-1",
      metadata: {
        receiptNumber: "REC-2026-001",
        agreementNumber: "OMR-2026-009",
        amountBaisa: 45500,
        method: "BANK_TRANSFER",
        ipHash: "secret-hash-should-not-appear",
      },
    });
    expect(paymentSummary).toContain("Agreement OMR-2026-009");
    expect(paymentSummary).toContain("Receipt REC-2026-001");
    expect(paymentSummary).toContain(formatOMR(45500));
    expect(paymentSummary).toContain("BANK TRANSFER");
    expect(paymentSummary).not.toContain("secret-hash");

    const swapSummary = formatActivitySummary({
      effectiveEvent: "VEHICLE_SWAPPED",
      entityType: "rental_swap",
      entityId: "s-1",
      metadata: {
        agreementNumber: "OMR-DEMO-001",
        previousVehicle: "OMN-1001",
        newVehicle: "OMN-2002",
        remarks: "Customer requested SUV upgrade",
      },
    });
    expect(swapSummary).toContain("OMN-1001 → OMN-2002");
    expect(swapSummary).toContain("Customer requested SUV upgrade");

    const roleSummary = formatActivitySummary({
      effectiveEvent: "ROLE_CHANGED",
      entityType: "user",
      entityId: "u-1",
      metadata: { from: "USER", to: "ADMIN" },
    });
    expect(roleSummary).toBe("USER → ADMIN");

    const permSummary = formatActivitySummary({
      effectiveEvent: "PERMISSIONS_CHANGED",
      entityType: "user",
      entityId: "u-1",
      metadata: { added: ["fleet:read", "fleet:update"], removed: ["users:read"], total: 5 },
    });
    expect(permSummary).toBe("+2 / -1 / 5 granted");
  });

  it("gates deep links by actor permissions", () => {
    const rentalReader = makeActor({ permissions: new Set(["rentals:read"]) });
    const financePrinter = makeActor({
      permissions: new Set(["finance:read", "finance:print", "customers:read"]),
    });

    expect(
      resolveActivityHref(
        "en",
        { effectiveEvent: "RENTAL_STARTED", entityType: "rental", entityId: "r-123", metadata: {} },
        rentalReader,
      ),
    ).toBe("/en/rentals/r-123");

    expect(
      resolveActivityHref(
        "en",
        {
          effectiveEvent: "BOOKING_DELETED",
          entityType: "rental",
          entityId: "r-123",
          metadata: {},
        },
        rentalReader,
      ),
    ).toBe("/en/rentals");

    expect(
      resolveActivityHref(
        "en",
        {
          effectiveEvent: "RECEIPT_RECORDED",
          entityType: "payment",
          entityId: "pay-1",
          metadata: {},
        },
        rentalReader,
      ),
    ).toBeNull();

    expect(
      resolveActivityHref(
        "en",
        {
          effectiveEvent: "RECEIPT_RECORDED",
          entityType: "payment",
          entityId: "pay-1",
          metadata: {},
        },
        financePrinter,
      ),
    ).toBe("/en/documents/receipt/pay-1");

    expect(
      resolveActivityHref(
        "en",
        {
          effectiveEvent: "CUSTOMER_CREATED",
          entityType: "customer",
          entityId: "cust-9",
          metadata: {},
        },
        financePrinter,
      ),
    ).toBe("/en/ledger?customerId=cust-9");
  });
});
