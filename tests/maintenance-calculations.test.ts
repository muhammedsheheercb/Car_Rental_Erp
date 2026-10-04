import { describe, expect, it } from "vitest";
import { expiryStatus, serviceDue } from "@/features/maintenance/calculations";

describe("maintenance intervals", () => {
  it("calculates the next service and remaining KM", () =>
    expect(serviceDue(14500, 10000, 5000, 1000)).toMatchObject({
      nextServiceKm: 15000,
      remainingKm: 500,
      show: true,
      status: "Approaching",
    }));
  it("includes the threshold boundary", () =>
    expect(serviceDue(14000, 10000, 5000, 1000).show).toBe(true));
  it("excludes vehicles outside the configured threshold", () =>
    expect(serviceDue(13999, 10000, 5000, 1000).show).toBe(false));
  it("shows due and overdue vehicles", () => {
    expect(serviceDue(15000, 10000, 5000, 0)).toMatchObject({
      remainingKm: 0,
      show: true,
      status: "Due / Overdue",
    });
    expect(serviceDue(15500, 10000, 5000, 0).remainingKm).toBe(-500);
  });
  it("resets the next interval after a completed service", () =>
    expect(serviceDue(15000, 15000, 5000, 1000)).toMatchObject({
      nextServiceKm: 20000,
      remainingKm: 5000,
      show: false,
    }));
  it("rejects zero intervals and invalid KM", () => {
    expect(() => serviceDue(1000, 0, 0, 100)).toThrow();
    expect(() => serviceDue(1000.5, 0, 10000, 100)).toThrow();
    expect(() => serviceDue(1000, 0, 10000, -1)).toThrow();
  });
});
describe("Oman document expiry", () => {
  const now = new Date("2026-10-03T06:00Z");
  it("classifies yesterday as expired", () =>
    expect(expiryStatus("2026-10-02", now, 30)).toEqual({ daysRemaining: -1, status: "Expired" }));
  it("keeps today's expiry valid through the Oman day", () =>
    expect(expiryStatus("2026-10-03", now, 30)).toEqual({
      daysRemaining: 0,
      status: "Expiring Soon",
    }));
  it("includes the soon threshold boundary", () =>
    expect(expiryStatus("2026-11-02", now, 30)).toEqual({
      daysRemaining: 30,
      status: "Expiring Soon",
    }));
  it("classifies beyond the threshold as valid", () =>
    expect(expiryStatus("2026-11-03", now, 30)).toEqual({ daysRemaining: 31, status: "Valid" }));
  it("uses the Oman date when UTC is still yesterday", () =>
    expect(expiryStatus("2026-10-03", new Date("2026-10-02T20:01Z"), 0)).toEqual({
      daysRemaining: 0,
      status: "Expiring Soon",
    }));
  it("does not expire a document before Oman midnight", () =>
    expect(expiryStatus("2026-10-03", new Date("2026-10-03T19:59Z"), 0).status).toBe(
      "Expiring Soon",
    ));
  it("expires at the following Oman midnight", () =>
    expect(expiryStatus("2026-10-03", new Date("2026-10-03T20:00Z"), 0).status).toBe("Expired"));
  it("reports missing expiry information", () =>
    expect(expiryStatus(null, now, 30)).toEqual({ daysRemaining: null, status: "Not configured" }));
  it("validates leap days and configurations", () => {
    expect(expiryStatus("2028-02-29", new Date("2028-02-28T06:00Z"), 30).daysRemaining).toBe(1);
    expect(() => expiryStatus("2026-02-29", now, 30)).toThrow();
    expect(() => expiryStatus("2026-10-04", now, -1)).toThrow();
  });
});
