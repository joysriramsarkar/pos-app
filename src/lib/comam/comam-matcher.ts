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
  'হলুদ': ['হলদি', 'haldi', 'turmeric', 'হলুদের'],
  'হলুদের': ['হলুদ', 'হলদি', 'haldi', 'turmeric'],
  'haldi': ['হলুদ', 'হলদি'],
  'চিনি': ['sugar', 'সুগার', 'চিনির'],
  'চিনির': ['চিনি', 'sugar'],
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
  'বিস্কফার্ম': ['বিস্কফার', 'বিস্কফার্মের', 'বিস্ক ফার্ম', 'biskfarm', 'bisk farm'],
  'বিস্কফার': ['বিস্কফার্ম', 'বিস্কফার্মের', 'biskfarm'],
  'biskfarm': ['বিস্কফার্ম', 'বিস্কফার', 'বিস্ক ফার্ম'],
  'মেরী': ['marie', 'মেরি', 'মেরি বিস্কুট', 'মেরী বিস্কুট'],
  'মেরি': ['marie', 'মেরী', 'মেরি বিস্কুট', 'মেরী বিস্কুট'],
  'মারি': ['marie', 'মেরি', 'মেরী', 'মারি বিস্কুট', 'মেরী বিস্কুট'],
  'marie': ['মেরি', 'মেরী', 'মারি'],
  'বিস্কুট': ['বিস্কিট', 'biscuit', 'biscuits'],
  'biscuit': ['বিস্কুট', 'বিস্কিট'],
  'খোলা চিনি': ['চিনি', 'সাদা চিনি', 'লুজ চিনি', 'sugar', 'চিনি খোলা'],
  'চিনি খোলা': ['খোলা চিনি', 'চিনি', 'লুজ চিনি', 'sugar'],
  'লুজ চিনি': ['চিনি', 'খোলা চিনি', 'sugar'],
  'সাদা চিনি': ['চিনি', 'sugar'],
  'খোলা ময়দা': ['ময়দা', 'লুজ ময়দা', 'খোলা ময়দা', 'ময়দা', 'ময়দা খোলা'],
  'ময়দা খোলা': ['খোলা ময়দা', 'ময়দা', 'লুজ ময়দা', 'খোলা ময়দা', 'ময়দা'],
  'খোলা ময়দা': ['ময়দা', 'লুজ ময়দা', 'খোলা ময়দা', 'ময়দা'],
  'ময়দা': ['খোলা ময়দা', 'খোলা ময়দা', 'maida', 'ময়দা'],
  'ময়দা': ['খোলা ময়দা', 'খোলা ময়দা', 'maida', 'ময়দা'],
  'সরিষার তেল': ['সর্ষের তেল', 'মাস্টার্ড অয়েল', 'mustard oil', 'সরিষা তেল'],
  'সর্ষের তেল': ['সরিষার তেল', 'mustard oil', 'সরিষা তেল'],
  'সরিষা তেল': ['সরিষার তেল', 'mustard oil'],
  'সাদা তেল': ['সয়াবিন তেল', 'সয়াবিন তেল', 'রিফাইন তেল', 'soyabean oil'],
  'সয়াবিন তেল': ['সাদা তেল', 'সয়াবিন তেল', 'soyabean oil', 'রিফাইন তেল'],
  'সয়াবিন তেল': ['সাদা তেল', 'সয়াবিন তেল', 'soyabean oil', 'রিফাইন তেল'],
  'খোলা চাল': ['চাল', 'rice'],
  'খোলা ডাল': ['ডাল', 'মসুর ডাল'],
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

  // Suffix stripped variant (e.g. "হলুদের" -> "হলুদ", "চিনির" -> "চিনি", "ময়দার" -> "ময়দা")
  const strippedWords = norm
    .split(/\s+/)
    .map((w) => stripBengaliSuffixes(w))
    .join(' ');
  if (strippedWords && strippedWords !== norm) {
    variants.add(strippedWords);
  }

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
    if (strippedWords && strippedWords.includes(key)) {
      for (const alias of aliases) {
        variants.add(strippedWords.replace(key, alias).trim());
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
  const normQuery = normalizeBengali(query);
  const qVariants = expandQueryAliases(query);
  if (qVariants.length === 0) return { matches: [], isAmbiguous: false };

  const scored: ProductMatch[] = [];

  for (const product of products) {
    if (product.isActive === false) continue;

    let bestScore = 0.0;
    const names = getProductNames(product);

    for (const name of names) {
      for (const q of qVariants) {
        let score = 0.0;
        if (q === name) {
          // Direct unaliased exact match gets 1.05; aliased exact match gets 1.0
          score = (q === normQuery) ? 1.05 : 1.0;
        } else if (q.length >= 3 && name.includes(q)) {
          const lengthBonus = Math.min(0.06, (q.length / Math.max(name.length, 1)) * 0.06);
          score = 0.92 + lengthBonus;
        } else if (q.length >= 3 && q.includes(name)) {
          score = 0.91;
        } else {
          // Token subset match: all tokens of q exist in name
          const qWords = q.split(/\s+/).filter((w) => w.length >= 2);
          if (qWords.length >= 2 && qWords.every((w) => name.includes(w))) {
            score = 0.90;
          } else {
            const sim = stringSimilarity(q, name);
            score = sim;
          }
        }
        bestScore = Math.max(bestScore, score);
        if (bestScore >= 1.05) break;
      }
      if (bestScore >= 1.05) break;
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
    topMatches[0].score - topMatches[1].score < 0.08 &&
    !(topMatches[0].score >= 0.98 && topMatches[1].score <= 0.92);

  return { matches: topMatches, isAmbiguous };
}

const BN_TO_LATIN_MAP: Record<string, string> = {
  'অ': 'o', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u', 'ঋ': 'ri',
  'এ': 'e', 'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou',
  'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng',
  'চ': 'ch', 'ছ': 'chh', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'n',
  'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n',
  'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
  'প': 'p', 'ফ': 'f', 'ব': 'b', 'ভ': 'bh', 'ম': 'm',
  'য': 'j', 'র': 'r', 'ল': 'l', 'শ': 'sh', 'ষ': 'sh', 'স': 's', 'হ': 'h',
  'ড়': 'r', 'ঢ়': 'rh', 'য়': 'y', 'ৎ': 't', 'ং': 'ng', 'ঃ': '', 'ঁ': '',
  'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ৃ': 'ri',
  'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou', '্': '',
};

export function transliterateBnToLatin(text: string): string {
  if (!text) return '';
  const norm = normalizeBengali(text).replace(/ক্ষ/g, 'kh');
  return norm
    .split('')
    .map((ch) => BN_TO_LATIN_MAP[ch] || ch)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripBengaliSuffixes(name: string): string {
  let cleaned = name.trim();

  // 1. Check for compound honorific suffixes (e.g. "রহিমদার", "সুধীরকাকার", "বিকাশবাবুর", "রফিকভাইয়ের")
  const honorificMatch = cleaned.match(/(?:দার|দা|বাবুর|বাবু|কাকার|কাকা|ভাইয়ের|ভাইয়ের|ভাই|দির|দিদি|দি|কে|রে)$/);
  if (honorificMatch) {
    return cleaned.slice(0, honorificMatch.index).trim();
  }

  // 2. Genitive suffix '-এর' or 'ের' (after consonants: "রহিমের", "সরকারের", "প্রদীপের")
  if (/(?:-এর|ের)$/.test(cleaned)) {
    return cleaned.replace(/(?:-এর|ের)$/, '').trim();
  }

  // 3. Genitive 'র' only after vowel 'া' (e.g. "সুমিতার", "রীতার", "মমতার")
  if (/(?<=[া])র$/.test(cleaned)) {
    return cleaned.replace(/র$/, '').trim();
  }

  return cleaned;
}

export function extractDueQueryTarget(text: string): {
  isGeneral: boolean;
  targetName: string | null;
} {
  const norm = normalizeBengali(text);

  // Check for general query phrases
  const isGeneral =
    /(^|\s)(কার|কাদের|সকলের|সবার|মোট|সব|দোকানের|আমাদের)(\s|$)/.test(norm) ||
    /^(বাকি\s*কত|কত\s*বাকি|বাকি\s*খাতা|বকেয়া\s*কত)/.test(norm);

  if (isGeneral) {
    return { isGeneral: true, targetName: null };
  }

  // Extract customer candidate: "[customer] (-এর) (কত) বাকি/বকেয়া" or "[customer] বাকি কত"
  const m = norm.match(/^(.*?)(?:\s+(?:-এর|ের|র))?(?:\s+কত)?\s*(?:বাকি|বকেয়া|দেনা)(?:\s+হিসাব)?(?:\s+(?:কত|কেমন|বলো|জানাও|দেখাও))?/i);
  if (m && m[1]) {
    const candidate = m[1].replace(/^(আজকে?|দয়া\s*করে|একটু)\s+/, '').trim();
    if (candidate) {
      const stripped = stripBengaliSuffixes(candidate);
      if (stripped && !/(?:^|\s)(কার|কাদের|সকলের|সবার|মোট|সব|দোকানের|আমাদের)(?:\s|$)/.test(stripped)) {
        return { isGeneral: false, targetName: stripped };
      }
    }
  }

  return { isGeneral: true, targetName: null };
}

// Common short Bengali words or conversational tokens that should never loosely match a customer
const COMMON_WORD_STOP_LIST = new Set([
  'বি', 'সে', 'মা', 'এক', 'একটা', 'দুই', 'দুইটা', 'দুটো', 'তিন', 'তিনটা', 'চার', 'চারটা', 'পাঁচ', 'পাঁচটা',
  'লোক', 'টাকা', 'দামের', 'দামে', 'দর', 'কেজি', 'গ্রাম', 'পোয়া', 'পোয়া', 'চিনি', 'ময়দা', 'ময়দা', 'হলুদ',
  'দাও', 'দিন', 'করো', 'করুন', 'এবং', 'আর', 'ও', 'কমা', 'ফুলস্টপ', 'বিল', 'খাতা', 'বাকি'
]);

export function findCustomer(
  customers: Customer[],
  text: string
): Customer | null {
  const normText = normalizeBengali(text);
  if (!normText) return null;

  const strippedText = stripBengaliSuffixes(normText);
  const latinText = transliterateBnToLatin(normText);
  const strippedLatinText = transliterateBnToLatin(strippedText);

  // 1. Exact match on full name, Bengali name, English name, or phone number
  for (const customer of customers) {
    if (customer.isActive === false) continue;

    const exactCandidates = [
      customer.name ? normalizeBengali(customer.name) : '',
      (customer as any).nameBn ? normalizeBengali((customer as any).nameBn) : '',
      customer.nameEn ? normalizeBengali(customer.nameEn) : '',
      customer.phone ? customer.phone.trim() : '',
    ].filter(Boolean);

    for (const cand of exactCandidates) {
      if (cand === normText || cand === strippedText) {
        return customer;
      }
    }
  }

  // 2. Word boundary match: customer's full name is a complete phrase/token sequence in the text
  for (const customer of customers) {
    if (customer.isActive === false) continue;

    const names = [
      customer.name ? normalizeBengali(customer.name) : '',
      (customer as any).nameBn ? normalizeBengali((customer as any).nameBn) : '',
      customer.nameEn ? normalizeBengali(customer.nameEn) : '',
    ].filter(Boolean);

    for (const n of names) {
      if (COMMON_WORD_STOP_LIST.has(n)) continue;
      // Must be at least 3 characters and match whole word boundaries (including common Bengali honorifics)
      if (n.length >= 3) {
        const regex = new RegExp(`(?:^|\\s+)${n}(?:-এর|ের|র|দার|দা|বাবু|বাবুর|কাকা|কাকার|ভাই|ভাইয়ের|ভাইয়ের|কে|রে)?(?=\\s+|$)`, 'i');
        if (regex.test(normText) || regex.test(strippedText)) {
          return customer;
        }
      }
    }
  }

  // 2b. Token match for single-word customer names after stripping suffixes (e.g. "রহিমদার" -> "রহিম", "রহিমদা" -> "রহিম")
  const strippedTokens = normText.split(/\s+/).map(stripBengaliSuffixes);
  for (const customer of customers) {
    if (customer.isActive === false) continue;
    const names = [
      customer.name ? normalizeBengali(customer.name) : '',
      (customer as any).nameBn ? normalizeBengali((customer as any).nameBn) : '',
      customer.nameEn ? normalizeBengali(customer.nameEn) : '',
    ].filter(Boolean);
    for (const n of names) {
      if (COMMON_WORD_STOP_LIST.has(n)) continue;
      if (n.length >= 3 && strippedTokens.includes(n)) {
        return customer;
      }
    }
  }

  // 3. For multi-word customer names (e.g. "লক্ষণ সরকার"):
  // Query matches if all non-stop words of the customer name are present in query tokens
  for (const customer of customers) {
    if (customer.isActive === false) continue;

    const cNames = [
      customer.name ? normalizeBengali(customer.name) : '',
      (customer as any).nameBn ? normalizeBengali((customer as any).nameBn) : '',
    ].filter(Boolean);

    for (const cName of cNames) {
      const cWords = cName.split(/\s+/).filter((w) => w.length >= 2 && !COMMON_WORD_STOP_LIST.has(w));
      if (cWords.length >= 2) {
        const textWords = new Set(normText.split(/\s+/).map(stripBengaliSuffixes));
        if (cWords.every((cw) => textWords.has(cw))) {
          return customer;
        }
      }
    }
  }

  // 4. Transliteration match (Bengali query matching English customer name or vice versa)
  for (const customer of customers) {
    if (customer.isActive === false) continue;

    const cNames = [
      customer.name ? customer.name.toLowerCase().trim() : '',
      customer.nameEn ? customer.nameEn.toLowerCase().trim() : '',
    ].filter(Boolean);

    for (const cName of cNames) {
      if (cName.length >= 4 && !COMMON_WORD_STOP_LIST.has(cName)) {
        if (latinText === cName || strippedLatinText === cName) {
          return customer;
        }
        const regex = new RegExp(`(?:^|\\s+)${cName}(?=\\s+|$)`, 'i');
        if (regex.test(latinText) || regex.test(strippedLatinText)) {
          return customer;
        }
      }
    }
  }

  return null;
}

const NAME_STOP_WORDS = new Set([
  'বিল', 'করো', 'করুন', 'দাও', 'দিন', 'দেন', 'নাও', 'চাই', 'বাকি', 'বাকিতে',
  'নগদ', 'নগদে', 'টাকা', 'টাকার', 'কেজি', 'গ্রাম', 'লিটার', 'ডজন', 'পোয়া', 'পোয়া', 'আর',
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

export function isProductOrUnitOrNumber(word: string, products: Product[]): boolean {
  const norm = normalizeBengali(word);
  if (!norm) return false;

  const UNITS = [
    'কেজি', 'কিলো', 'কিলোগ্রাম', 'গ্রাম', 'লিটার', 'লি', 'মিলি', 'পিস', 'প্যাকেট', 'প্যাক',
    'ডজন', 'বোতল', 'পোয়া', 'পোয়া', 'টা', 'টি', 'টে', 'টো', 'খানা', 'টাকা', 'টাকার',
    'মূল্যের', 'দামের', 'দামে', 'দর'
  ];
  if (UNITS.includes(norm)) return true;
  if (/^[\d০-৯]+$/.test(norm)) return true;

  const NUM_WORDS = [
    'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়', 'দশ',
    'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ', 'কুড়ি', 'বিশ',
    'তিরিশ', 'চল্লিশ', 'পঞ্চাশ', 'ষাট', 'সত্তর', 'আশি', 'নব্বই', 'একশো', 'শ', 'শো', 'হাজার',
    'আধা', 'আধ', 'হাফ', 'দেড়', 'দেড়', 'আড়াই', 'আড়াই', 'পৌনে', 'সোয়া'
  ];
  if (NUM_WORDS.includes(norm)) return true;

  // Recognizes piece-suffixed numbers e.g. "তিনটা", "দুটো", "দুইটা", "১টা", "৪টি", "১খানা", etc.
  const piecePattern = /^([\d০-৯]+|এক|দুই|তিন|চার|পাঁচ|ছয়|সাত|আট|নয়|দশ|এগারো|বারো|তেরো|চৌদ্দ|পনেরো|ষোলো|সতেরো|আঠারো|উনিশ|কুড়ি|বিশ|দু|আধ|আধা|দেড়|দেড়|আড়াই|আড়াই|পৌনে|সোয়া)(?:টা|টি|টে|টো|খানা|পিস|প্যাকেট|কেজি|গ্রাম|লিটার|পোয়া|পোয়া)$/;
  if (piecePattern.test(norm)) return true;

  // Check product catalog
  for (const p of products) {
    if (p.nameBn) {
      const pNorm = normalizeBengali(p.nameBn);
      if (pNorm === norm || pNorm.split(/\s+/).includes(norm)) return true;
    }
    if (p.name) {
      const pNorm = normalizeBengali(p.name);
      if (pNorm === norm || pNorm.split(/\s+/).includes(norm)) return true;
    }
  }

  return false;
}

export function extractCustomerClause(
  rawText: string,
  customers: Customer[],
  products: Product[]
): {
  customer: Customer | null;
  customerName: string | null;
  cleanItemsText: string;
  isExplicitDue: boolean;
} {
  const text = rawText
    .replace(/[;!?\"'()—–-]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

  let customerCandidate: string | null = null;
  let cleanItemsText = text;
  let isExplicitDue = false;

  // Pattern 1: "... [customer] (র/এর)? নামে [বাকি/বিল/করো/রাখো]" or "... [customer] (র/এর)? খাতায় [বাকি]"
  const nameKeywordMatch = text.match(
    /(?:^|\s+)(?:র|এর|-এর)?\s*(নামে|খাতায়)(?:\s+(?:বাকি|বিল|সেল))?(?:\s*(?:করো|করুন|রাখো|দাও|দিন|লিখে\s*রাখো|লিখুন))?(?=$|[\s।,;!?]+)/i
  );

  if (nameKeywordMatch && nameKeywordMatch.index !== undefined) {
    if (/বাকি|খাতায়|নামে/.test(nameKeywordMatch[0])) {
      isExplicitDue = true;
    }
    if (/নগদ|নগদে|ক্যাশ/.test(rawText)) {
      isExplicitDue = false;
    }
    const beforeKeyword = text.slice(0, nameKeywordMatch.index).trim();
    const afterKeyword = text.slice(nameKeywordMatch.index + nameKeywordMatch[0].length).trim();
    const tokens = beforeKeyword.split(/\s+/).filter(Boolean);

    const nameTokens: string[] = [];
    while (tokens.length > 0 && nameTokens.length < 3) {
      const last = tokens[tokens.length - 1];
      const cleanedLast = stripBengaliSuffixes(last);

      if (
        isProductOrUnitOrNumber(cleanedLast, products) ||
        isProductOrUnitOrNumber(last, products)
      ) {
        break;
      }
      nameTokens.unshift(cleanedLast);
      tokens.pop();
    }

    if (nameTokens.length > 0) {
      customerCandidate = nameTokens.join(' ');
      cleanItemsText = (tokens.join(' ') + ' ' + afterKeyword).trim();
    }
  }

  // Pattern 2: "[customer] (কে/রে) (বিল করো|দাও|দিন|সেল করো)"
  if (!customerCandidate) {
    const keMatch = text.match(
      /(?:^|\s+)([^\s,।]+(?:\s+[^\s,।]+)?)(কে|রে)\s+(?:বিল\s*করো|দাও|দিন|সেল\s*করো)(?=$|\s+)/i
    );
    if (keMatch && keMatch[1]) {
      const cand = stripBengaliSuffixes(keMatch[1].trim());
      if (!isProductOrUnitOrNumber(cand, products)) {
        customerCandidate = cand;
        cleanItemsText = text.replace(keMatch[0], ' ').replace(/\s+/g, ' ').trim();
      }
    }
  }

  // Pattern 3: Explicit customer prefix: "গ্রাহক [নাম]" or "ক্রেতা [নাম]"
  if (!customerCandidate) {
    const prefixMatch = text.match(/^(?:গ্রাহক|ক্রেতা)\s+([^\s,।]+(?:\s+[^\s,।]+)?)\b/i);
    if (prefixMatch && prefixMatch[1]) {
      const cand = stripBengaliSuffixes(prefixMatch[1].trim());
      if (!isProductOrUnitOrNumber(cand, products)) {
        customerCandidate = cand;
        cleanItemsText = text.slice(prefixMatch[0].length).trim();
      }
    }
  }

  // If an explicit customer candidate was extracted, look it up in registered customers
  if (customerCandidate) {
    const registered = findCustomer(customers, customerCandidate);
    return {
      customer: registered,
      customerName: registered ? registered.name : customerCandidate,
      cleanItemsText,
      isExplicitDue,
    };
  }

  // Pattern 4: Sentence starts with registered customer's full multi-word name (e.g. "লক্ষণ সরকার ২ কেজি চিনি")
  for (const c of customers) {
    if (c.isActive === false) continue;
    const cNames = [c.name, (c as any).nameBn, c.nameEn].filter(Boolean) as string[];
    for (const name of cNames) {
      const normN = normalizeBengali(name);
      if (normN.includes(' ') && normN.length >= 5) {
        if (text.startsWith(normN)) {
          const remainder = text.slice(normN.length).trim();
          return {
            customer: c,
            customerName: c.name,
            cleanItemsText: remainder,
            isExplicitDue: false,
          };
        }
      }
    }
  }

  // DEFAULT: No customer mentioned in sentence -> CASH / WALK-IN sale!
  return {
    customer: null,
    customerName: null,
    cleanItemsText: text,
    isExplicitDue: false,
  };
}
