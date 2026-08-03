// Subcategory Usage Tracker for Smart Sorting (Most Used First)

const KEY = 'subcategory_usage_v1';

interface UsageMap {
  [key: string]: number;
}

const getUsageMap = (): UsageMap => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('Failed to read subcategory usage map:', e);
    return {};
  }
};

export const bumpSubcategoryUsage = (mainCat: string, subCat: string) => {
  if (!mainCat || !subCat || typeof window === 'undefined') return;
  try {
    const map = getUsageMap();
    const key = `${mainCat.trim()}::${subCat.trim()}`;
    map[key] = (map[key] || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('Failed to bump subcategory usage:', e);
  }
};

export const getSubcategoryUsage = (mainCat: string, subCat: string): number => {
  if (!mainCat || !subCat) return 0;
  const map = getUsageMap();
  return map[`${mainCat.trim()}::${subCat.trim()}`] || 0;
};

export const getSortedSubcategories = (mainCat: string, subCategories: string[]): string[] => {
  if (!mainCat || subCategories.length <= 1) return subCategories;
  const map = getUsageMap();
  return [...subCategories].sort((a, b) => {
    const usageA = map[`${mainCat.trim()}::${a.trim()}`] || 0;
    const usageB = map[`${mainCat.trim()}::${b.trim()}`] || 0;
    if (usageB !== usageA) {
      return usageB - usageA; // Descending by usage
    }
    return a.localeCompare(b);
  });
};
