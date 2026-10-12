/**
 * Phone normalization (MP-05).
 * Canonical form is E.164-ish: "+" + digits, e.g. +8801712345678.
 * Identity lookups must ALWAYS use the exact canonical value —
 * never contains/endsWith/last-10-digits.
 */
export function normalizePhoneToE164(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  // Heuristic default region: Bangladesh (880) / India (91) numbers are
  // stored with explicit country code. If no "+" and 11 digits starting
  // with 0, treat leading 0 as trunk prefix.
  let normalized = digits;
  if (!hasPlus && normalized.startsWith("0")) {
    normalized = normalized.slice(1);
    // Without country context we cannot invent one — caller must supply
    // full international format. Return bare digits so exact lookup fails
    // closed (no fuzzy fallback) rather than mismatching another account.
    return normalized;
  }
  return `+${normalized}`;
}
