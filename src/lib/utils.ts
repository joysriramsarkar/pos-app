import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Convert Bengali numerals to English numerals
 * Bengali numerals: ০ ১ ২ ৩ ৪ ৫ ৬ ৭ ৮ ৯
 * English numerals: 0 1 2 3 4 5 6 7 8 9
 */
export function convertBengaliToEnglishNumerals(input: string): string {
  const bengaliToEnglish: { [key: string]: string } = {
    '০': '0',
    '১': '1',
    '২': '2',
    '৩': '3',
    '৪': '4',
    '৫': '5',
    '৬': '6',
    '৭': '7',
    '৮': '8',
    '৯': '9',
  };

  return input.replace(/[০-৯]/g, (match) => bengaliToEnglish[match] || match);
}

export function isValidEanUpcBarcode(input: string): boolean {
  const normalized = convertBengaliToEnglishNumerals(input.trim());
  return /^\d{6,14}$/.test(normalized);
}

/**
 * Convert English numerals to Bengali numerals
 * English numerals: 0 1 2 3 4 5 6 7 8 9
 * Bengali numerals: ০ ১ ২ ৩ ৪ ৫ ৬ ৭ ৮ ৯
 */
export function convertEnglishToBengaliNumerals(input: string | number): string {
  const englishToBengali: { [key: string]: string } = {
    '0': '০',
    '1': '১',
    '2': '২',
    '3': '৩',
    '4': '৪',
    '5': '৫',
    '6': '৬',
    '7': '৭',
    '8': '৮',
    '9': '৯',
  };

  return String(input).replace(/[0-9]/g, (match) => englishToBengali[match] || match);
}

/**
 * Normalize search text: converts Bengali numerals to English, converts to lowercase,
 * and strips apostrophes, quotes, and hyphens so "lay's" and "lays" match identically.
 */
export function normalizeSearchText(input: string): string {
  if (!input) return '';
  return convertBengaliToEnglishNumerals(input)
    .toLowerCase()
    .replace(/[''"`-]/g, '')
    .trim();
}
export function sortByPopularity<T extends { id: string; name: string }>(
  items: T[],
  rankOf: (id: string) => number | undefined,
): T[] {
  const ranked = items
    .filter((item) => (rankOf(item.id) ?? 0) > 0)
    .sort((a, b) => (rankOf(a.id) ?? 0) - (rankOf(b.id) ?? 0));

  const unranked = items
    .filter((item) => !((rankOf(item.id) ?? 0) > 0))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...ranked, ...unranked];
}
