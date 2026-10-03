import { describe, expect, it } from "vitest";
import { formatLateDuration, omanDayBounds } from "@/features/rentals/operations-time";

describe("Oman operational times", () => {
  it("uses Oman midnight even when UTC is on the previous day", () => {
    const { start, end } = omanDayBounds(new Date("2026-09-30T22:30:00Z"));
    expect(start.toISOString()).toBe("2026-09-30T20:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-01T20:00:00.000Z");
    expect(new Date("2026-10-01T06:00:00Z") >= start).toBe(true);
    expect(end.getTime() - start.getTime()).toBe(86400000);
  });
  it("changes the display from hours to days without changing stored timestamps", () => {
    const expected = new Date("2026-10-01T09:00:00Z");
    const elapsed = (minutes: number) => new Date(expected.getTime() + minutes * 60000);
    expect(formatLateDuration(expected, elapsed(-1))).toBe("On time");
    expect(formatLateDuration(expected, elapsed(0))).toBe("On time");
    expect(formatLateDuration(expected, elapsed(0.5))).toBe("Less than a minute late");
    expect(formatLateDuration(expected, elapsed(1))).toBe("1 minute late");
    expect(formatLateDuration(expected, elapsed(60))).toBe("1 hour late");
    expect(formatLateDuration(expected, elapsed(120))).toBe("2 hours late");
    expect(formatLateDuration(expected, elapsed(1440))).toBe("1 day late");
    expect(formatLateDuration(expected, elapsed(1560))).toBe("1 day 2 hours late");
    expect(formatLateDuration(expected, elapsed(2880))).toBe("2 days late");
    expect(expected.toISOString()).toBe("2026-10-01T09:00:00.000Z");
  });
});
