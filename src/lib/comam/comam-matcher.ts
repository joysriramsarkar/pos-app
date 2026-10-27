/**
 * Catalog & Customer Matcher for Comam AI integration in pos-app.
 * Matches spoken Bengali/Banglish against POS products and customers.
 */
import type { Product, Customer } from '@/types/pos';

export function normalizeBengali(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/য়/g, 'য়')
    .replace(/ড়/g, 'ড়')
    .replace(/[\s\-_]+/g, ' ')
    .replace(/[।,;:!?\"'()]/g, '')
    .trim();
}

/** Compute string similarity ratio (Dice's coefficient / bigram overlap) */
export function stringSimilarity(s1: string, s2: string): number {
  const str1 = normalizeBengali(s1);
  const str2 = normalizeBengali(s2);

  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  if (str1.includes(str2) || str2.includes(str1)) return 0.9;

  // Bigram Dice coefficient
  const getBigrams = (str: string): Map<string, number> => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.substring(i, i + 2);
      bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
    }
    return bigrams;
  };

  const b1 = getBigrams(str1);
  const b2 = getBigrams(str2);
  let intersection = 0;

  for (const [bg, count] of b1) {
    if (b2.has(bg)) {
      intersection += Math.min(count, b2.get(bg)!);
    }
  }

  const total = (str1.length - 1) + (str2.length - 1);
  if (total <= 0) return 0.0;
  return (2.0 * intersection) / total;
}

export interface ProductMatch {
  product: Product;
  score: number;
}

export interface SearchProductsResult {
  matches: ProductMatch[];
  isAmbiguous: boolean;
}

function getProductNames(p: Product): string[] {
  const names: string[] = [];
  if (p.nameBn) names.push(normalizeBengali(p.nameBn));
  if (p.name) names.push(normalizeBengali(p.name));
  if (p.category) names.push(normalizeBengali(p.category));

  // Also include attributes e.g. Color, Size, Brand if present
  if (p.attributes && typeof p.attributes === 'object') {
    for (const val of Object.values(p.attributes)) {
      if (typeof val === 'string' && val.trim()) {
        names.push(normalizeBengali(val));
      }
    }
  }

  return names.filter(Boolean);
}

export function searchProducts(
  products: Product[],
  query: string,
  limit: number = 5
): SearchProductsResult {
  const q = normalizeBengali(query);
  if (!q) return { matches: [], isAmbiguous: false };

  const scored: ProductMatch[] = [];

  for (const product of products) {
    if (product.isActive === false) continue;

    let bestScore = 0.0;
    const names = getProductNames(product);

    for (const name of names) {
      if (q === name) {
        bestScore = 1.0;
        break;
      } else if (q.length >= 2 && (name.includes(q) || q.includes(name))) {
        bestScore = Math.max(bestScore, 0.9);
      } else {
        const sim = stringSimilarity(q, name);
        bestScore = Math.max(bestScore, sim);
      }
    }

    if (bestScore >= 0.55) {
      scored.push({ product, score: bestScore });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const topMatches = scored.slice(0, limit);

  const isAmbiguous =
    topMatches.length >= 2 &&
    topMatches[1].score >= 0.55 &&
    topMatches[0].score - topMatches[1].score < 0.08;

  return { matches: topMatches, isAmbiguous };
}

export function findCustomer(
  customers: Customer[],
  text: string
): Customer | null {
  const normText = normalizeBengali(text);
  if (!normText) return null;

  for (const customer of customers) {
    if (customer.isActive === false) continue;

    const names = [
      customer.name ? normalizeBengali(customer.name) : '',
      customer.nameEn ? normalizeBengali(customer.nameEn) : '',
      customer.phone ? customer.phone.trim() : '',
    ].filter(Boolean);

    for (const n of names) {
      if (n.length >= 2 && normText.includes(n)) {
        return customer;
      }
    }
  }

  return null;
}

const NAME_STOP_WORDS = new Set([
  'বিল', 'করো', 'করুন', 'দাও', 'দিন', 'দেন', 'নাও', 'চাই', 'বাকি', 'বাকিতে',
  'নগদ', 'নগদে', 'টাকা', 'টাকার', 'কেজি', 'গ্রাম', 'লিটার', 'ডজন', 'আর',
  'এবং', 'ও', 'জমা', 'দিলেন', 'দিল', 'কিনলাম', 'কিনেছি', 'এনেছি', 'আনলাম',
  'বিক্রি', 'সেল', 'ইউপিআই', 'ইউপিআইতে', 'কার্টে', 'রাখো', 'যোগ',
]);

export function extractSpokenCustomerName(text: string, products: Product[]): string | null {
  const normText = normalizeBengali(text);
  const patterns = [
    /([\u0980-\u09FF]+(?:\s+[\u0980-\u09FF]+){0,2})কে(?:\s+|$)/,
    /([\u0980-\u09FF]+(?:\s+[\u0980-\u09FF]+){0,2})র?\s+নামে/,
  ];

  for (const pat of patterns) {
    const m = normText.match(pat);
    if (!m) continue;

    const words = m[1].split(/\s+/).filter(Boolean);
    while (words.length > 0 && NAME_STOP_WORDS.has(words[0])) {
      words.shift();
    }
    if (words.length === 0 || words.some((w) => NAME_STOP_WORDS.has(w))) {
      continue;
    }

    let lastWord = words[words.length - 1];
    if (lastWord.endsWith('দার') && lastWord.length > 3) {
      words[words.length - 1] = lastWord.slice(0, -3);
    } else if (lastWord.endsWith('দা') && lastWord.length > 3) {
      words[words.length - 1] = lastWord.slice(0, -2);
    }

    const candidateName = words.join(' ').trim();
    if (!candidateName) continue;

    // Check if the candidate name is actually a product
    const { matches } = searchProducts(products, candidateName, 1);
    if (matches.length > 0 && matches[0].score >= 0.9) {
      continue; // It's a product, not a customer
    }

    return candidateName;
  }

  return null;
}
