/**
 * Business-timezone helpers (MP-25/I18N-004, H12).
 *
 * Storage stays UTC; every display string and every report day-boundary is
 * computed in the BUSINESS timezone (Business.timezone, e.g. Asia/Kolkata).
 * Without this, Cloudflare UTC midnight ≠ shop midnight and invoice dates,
 * day-close and shift windows disagree.
 */
import { formatInTimeZone } from "date-fns-tz";

export const DEFAULT_BUSINESS_TIMEZONE = "Asia/Kolkata";

export function normalizeTimezone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_BUSINESS_TIMEZONE;
  try {
    // Throws RangeError for unknown zones — fall back instead of crashing receipts.
    formatInTimeZone(new Date(), tz, "yyyy");
    return tz;
  } catch {
    return DEFAULT_BUSINESS_TIMEZONE;
  }
}

export interface BusinessTimeParts {
  year: number;
  month: number; // 1-12
  day: number;
  weekdaySun0: number; // 0=Sunday .. 6=Saturday
  hour24: number;
  minute: number;
}

/** Calendar parts of an instant in the business timezone. */
export function businessTimeParts(
  date: Date | string | number,
  timezone?: string | null,
): BusinessTimeParts {
  const tz = normalizeTimezone(timezone);
  const d = new Date(date);
  const num = (fmt: string) => Number(formatInTimeZone(d, tz, fmt));
  // ISO weekday 1(Mon)..7(Sun) -> Sunday-first 0..6
  const iso = num("i");
  return {
    year: num("yyyy"),
    month: num("M"),
    day: num("d"),
    weekdaySun0: iso % 7,
    hour24: num("H"),
    minute: num("m"),
  };
}

/** Format an instant with a date-fns pattern in the business timezone. */
export function formatInBusinessTimezone(
  date: Date | string | number,
  formatStr: string,
  timezone?: string | null,
): string {
  return formatInTimeZone(new Date(date), normalizeTimezone(timezone), formatStr);
}

/**
 * UTC range covering one business calendar day (yyyy-MM-dd in business tz).
 * Use for ALL report day filters so midnight boundaries follow shop time.
 */
export function businessDayRangeUTC(
  dayKey: string,
  timezone?: string | null,
): { start: Date; end: Date } {
  const tz = normalizeTimezone(timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    throw new Error(`Invalid day key (expected yyyy-MM-dd): ${dayKey}`);
  }
  // Noon UTC on the calendar day is unambiguous; derive offsets from it.
  const probe = new Date(`${dayKey}T12:00:00Z`);
  const offsetMin = -offsetMinutesAt(probe, tz);
  const start = new Date(`${dayKey}T00:00:00Z`);
  start.setUTCMinutes(start.getUTCMinutes() + offsetMin);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function offsetMinutesAt(date: Date, tz: string): number {
  // Local civil time rendered in tz, reinterpreted as UTC, minus the instant.
  const asUTC = Date.parse(formatInTimeZone(date, tz, "yyyy-MM-dd'T'HH:mm:ss'Z'"));
  return (asUTC - date.getTime()) / 60000;
}

/** Business calendar day key (yyyy-MM-dd) for an instant. */
export function toBusinessDayKey(
  date: Date | string | number,
  timezone?: string | null,
): string {
  return formatInBusinessTimezone(date, "yyyy-MM-dd", timezone);
}
