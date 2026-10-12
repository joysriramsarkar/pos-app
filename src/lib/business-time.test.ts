import { describe, expect, it } from "vitest";
import {
  businessDayRangeUTC,
  businessTimeParts,
  toBusinessDayKey,
} from "@/lib/business-time";
import { formatReceiptDate, formatReceiptTime } from "@/lib/receipt-i18n";

describe("MP-25/H12 business timezone", () => {
  // 2026-10-11T18:30:00Z == 2026-10-12 00:00 Asia/Kolkata (midnight boundary).
  const midnightIST = "2026-10-11T18:30:00Z";

  it("resolves calendar parts in business tz, not UTC", () => {
    const p = businessTimeParts(midnightIST, "Asia/Kolkata");
    expect([p.year, p.month, p.day]).toEqual([2026, 10, 12]);
    expect(p.hour24).toBe(0);
    // Same instant in UTC is still Oct 11.
    const u = businessTimeParts(midnightIST, "UTC");
    expect([u.year, u.month, u.day]).toEqual([2026, 10, 11]);
  });

  it("prints receipt dates in business tz", () => {
    expect(formatReceiptDate(midnightIST, "en", { timezone: "Asia/Kolkata" })).toBe("12/10/2026");
    expect(formatReceiptDate(midnightIST, "en", { timezone: "UTC" })).toBe("11/10/2026");
    expect(formatReceiptTime(midnightIST, "en", { timezone: "Asia/Kolkata" })).toBe("12:00 AM");
  });

  it("builds UTC day ranges from business calendar days", () => {
    const { start, end } = businessDayRangeUTC("2026-10-12", "Asia/Kolkata");
    expect(start.toISOString()).toBe("2026-10-11T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-10-12T18:30:00.000Z");
    expect(toBusinessDayKey("2026-10-11T18:30:00Z", "Asia/Kolkata")).toBe("2026-10-12");
  });

  it("handles a DST transition zone deterministically", () => {
    // US DST ends 2026-11-01 02:00 local; noon UTC probe stays unambiguous.
    const { start, end } = businessDayRangeUTC("2026-11-01", "America/New_York");
    expect(end.getTime() - start.getTime()).toBeGreaterThan(0);
    expect(toBusinessDayKey(start, "America/New_York")).toBe("2026-11-01");
  });

  it("falls back for unknown zones and rejects bad day keys", () => {
    const p = businessTimeParts(midnightIST, "Mars/Olympus");
    expect([p.year, p.month, p.day]).toEqual([2026, 10, 12]);
    expect(() => businessDayRangeUTC("not-a-date", "Asia/Kolkata")).toThrow();
  });
});
