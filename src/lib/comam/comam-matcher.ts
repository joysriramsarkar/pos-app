/**
 * Catalog & Customer Matcher for Comam AI integration in pos-app.
 * Matches spoken Bengali/Banglish against POS products and customers.
 */
import type { Product, Customer } from '@/types/pos';

import { bnToAscii } from './bn-parser';

const BRAND_ALIASES: Record<string, string[]> = {
  'সেভেন আপ': ['৭ আপ', '7 up', '7up', 'seven up'],
  '৭ আপ': ['সেভেন আপ', '7 up', '7up', 'seven up'],
  '7 up': ['সেভেন আপ', '৭ আপ', '7up'],
  '7up': ['সেভেন আপ', '৭ আপ', '7 up'],
  'সানরাইজ': ['সাবরাইজ', 'sunrise'],
  'সাবরাইজ': ['সানরাইজ', 'sunrise'],
  'sunrise': ['সানরাইজ', 'সাবরাইজ'],
  'হলুদ': ['হলদি', 'haldi', 'turmeric'],
  'haldi': ['হলুদ', 'হলদি'],
  'চিনি': ['sugar', 'সুগার'],
  'sugar': ['চিনি'],
  'কোক': ['কোকা কোলা', 'কোকাকোলা', 'coca cola', 'coke'],
  'কোকাকোলা': ['কোক', 'কোকা কোলা', 'coke'],
  'থামস আপ': ['থাম্বস আপ', 'thums up', 'thumps up'],
  'স্প্রাইট': ['sprite'],
  'মিরিন্ডা': ['mirinda'],
  'ফান্টা': ['fanta'],
  'ম্যাগি': ['maggi'],
  'ক্লোজ আপ': ['close up', 'ক্লোজআপ'],
  'ডাভ': ['dove'],
  'লাক্স': ['lux'],
  'হুইল': ['wheel'],
  'সার্ফ এক্সেল': ['surf excel'],
  'লাইফবয়': ['lifebuoy', 'লাইসবয়'],
  'ফরচুন': ['fortune'],
};

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

export function expandQueryAliases(text: string): string[] {
  const norm = normalizeBengali(text);
  if (!norm) return [];
  const variants = new Set<string>([norm]);

  // Transliterate English spoken numbers in Bengali script
  const numSub = norm
    .replace(/\bসেভেন\b|সেভেন/g, '৭')
    .replace(/\bওয়ান\b|ওয়ান/g, '১')
    .replace(/\bটু\b|টু/g, '২')
    .replace(/\bথ্রি\b|থ্রি/g, '৩')
    .replace(/\bফোর\b|ফোর/g, '৪')
    .replace(/\bফাইভ\b|ফাইভ/g, '৫')
    .replace(/\bসিক্স\b|সিক্স/g, '৬')
    .replace(/\bএইট\b|এইট/g, '৮')
    .replace(/\bনাইন\b|নাইন/g, '৯')
    .replace(/\bটেন\b|টেন/g, '১০');
  variants.add(numSub);

  // English digits representation (e.g. "৭ আপ" -> "7 up" / "7 আপ")
  const asciiConverted = bnToAscii(numSub);
  variants.add(asciiConverted);
  variants.add(asciiConverted.replace(/আপ\b/g, 'up'));

  // Brand synonyms
  for (const [key, aliases] of Object.entries(BRAND_ALIASES)) {
    if (norm.includes(key)) {
      for (const alias of aliases) {
        variants.add(norm.replace(key, alias).trim());
      }
    }
    if (numSub.includes(key)) {
      for (const alias of aliases) {
        variants.add(numSub.replace(key, alias).trim());
      }
    }
  }

  return Array.from(variants).filter(Boolean);
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
  const qVariants = expandQueryAliases(query);
  if (qVariants.length === 0) return { matches: [], isAmbiguous: false };

  const scored: ProductMatch[] = [];

  for (const product of products) {
    if (product.isActive === false) continue;

    let bestScore = 0.0;
    const names = getProductNames(product);

    for (const name of names) {
      for (const q of qVariants) {
        if (q === name) {
          bestScore = Math.max(bestScore, 1.0);
          break;
        } else if (q.length >= 2 && (name.includes(q) || q.includes(name))) {
          bestScore = Math.max(bestScore, 0.92);
        } else {
          // Token subset match: all tokens of q exist in name
          const qWords = q.split(/\s+/).filter((w) => w.length >= 2);
          if (qWords.length >= 2 && qWords.every((w) => name.includes(w))) {
            bestScore = Math.max(bestScore, 0.90);
          } else {
            const sim = stringSimilarity(q, name);
            bestScore = Math.max(bestScore, sim);
          }
        }
      }
      if (bestScore >= 1.0) break;
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
