import { convertBengaliToEnglishNumerals } from "@/lib/utils";

export type PartyType = "customer" | "supplier";

/** Stable avatar background from a name string. */
export function getInitialsBg(name: string): string {
  const colors = [
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
    "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Normalize phone to 10-digit national form (BD/IN style prefixes).
 * Returns null if invalid after cleanup.
 */
export function normalizeAndValidatePhone(phone: string): string | null {
  if (!phone) return null;

  let clean = phone.replace(/\s+/g, "");
  clean = convertBengaliToEnglishNumerals(clean);

  if (clean.startsWith("+")) {
    clean = clean.slice(1);
  }

  if (clean.startsWith("091") && clean.length === 13) {
    clean = clean.slice(3);
  } else if (clean.startsWith("91") && clean.length === 12) {
    clean = clean.slice(2);
  } else if (clean.startsWith("0") && clean.length === 11) {
    clean = clean.slice(1);
  }

  if (/^[0-9]{10}$/.test(clean)) {
    return clean;
  }

  return null;
}
